// ──────────────────────────────────────────────────────
// @tenantscale/cli — Database Schema Analyzer
// ──────────────────────────────────────────────────────
// Scans SQL migration files, Prisma schemas, and Drizzle
// schemas to discover tables, foreign keys, and existing
// tenant isolation status.

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { findFiles, readFileSafe } from '../utils/file-glob.js'

export interface TableInfo {
  name: string
  /** Already has tenant_id column? */
  hasTenantId: boolean
  /** References tenants(id) foreign key? */
  referencesTenants: boolean
  /** Has user_id column? (indirect tenant scope via user) */
  hasUserId: boolean
  /** Has owner_id / organization_id / team_id? */
  hasOrgId: boolean
  /** Total columns found */
  columnCount: number
  /** Found in which file */
  sourceFile: string
  /** Likelihood this table is tenant-scoped (0-1) */
  tenantScopeScore: number
}

export interface DatabaseInfo {
  /** Detected ORM/DB approach */
  orm: 'supabase' | 'prisma' | 'drizzle' | 'knex' | 'raw-sql' | 'unknown'
  /** All tables found */
  tables: TableInfo[]
  /** Tables recommended for tenant isolation */
  tenantTables: TableInfo[]
  /** Database URL or connection info found */
  dbUrlPattern: string | null
  /** Whether RLS is already enabled on any table */
  hasExistingRls: boolean
  /** Evidence collected */
  evidence: string[]
}

// Tables that should never be tenant-scoped
const SYSTEM_TABLES = new Set([
  'migrations', '_migrations', 'knex_migrations',
  '_prisma_migrations', 'schema_migrations',
  'plans', 'subscriptions', 'audit_events', 'api_keys',
  'impersonation_sessions', 'tenants', 'organizations', 'teams',
  'users', 'auth.users', 'accounts', 'sessions', 'verification_tokens',
])

// Tables that are very likely tenant-scoped by name
const TENANT_LIKELY_NAMES = [
  /^(user|profile|account|membership)/i,
  /^(project|product|invoice|order|payment|transaction|subscription)/i,
  /^(document|file|note|task|issue|ticket|comment|post)/i,
  /^(customer|client|lead|deal|contact)/i,
  /^(setting|config|preference)/i,
]

const CREATE_TABLE_RE = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)/gi

/**
 * Analyze the database schema of the project.
 */
export function analyzeDatabase(projectDir: string, sourceFiles: string[]): DatabaseInfo {
  const evidence: string[] = []
  const orm = detectOrm(projectDir, sourceFiles, evidence)
  const tables = discoverTables(projectDir, sourceFiles, orm, evidence)
  const tenantTables = tables
    .filter(t => t.tenantScopeScore > 0.3)
    .sort((a, b) => b.tenantScopeScore - a.tenantScopeScore)

  const hasExistingRls = sourceFiles.some(f => {
    const content = readFileSafe(f)
    return content && /enable\s+row\s+level\s+security/i.test(content)
  })

  const dbUrlPattern = findDbUrl(sourceFiles)

  return {
    orm,
    tables,
    tenantTables,
    dbUrlPattern,
    hasExistingRls,
    evidence,
  }
}

function detectOrm(projectDir: string, sourceFiles: string[], evidence: string[]): DatabaseInfo['orm'] {
  // Check package.json for ORM dependencies
  const pkgFiles = findFiles(projectDir, { filenames: ['package.json'] })
  for (const p of pkgFiles) {
    const content = readFileSafe(p)
    if (!content) continue
    try {
      const pkg = JSON.parse(content)
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      if (deps['@supabase/supabase-js']) {
        evidence.push('Found @supabase/supabase-js dependency')
        return 'supabase'
      }
      if (deps['@prisma/client'] || deps['prisma']) {
        evidence.push('Found Prisma dependency')
        return 'prisma'
      }
      if (deps['drizzle-orm'] || deps['drizzle-kit']) {
        evidence.push('Found Drizzle ORM dependency')
        return 'drizzle'
      }
      if (deps['knex']) {
        evidence.push('Found Knex dependency')
        return 'knex'
      }
    } catch { /* skip */ }
  }

  // Check source files for imports
  for (const f of sourceFiles) {
    const content = readFileSafe(f)
    if (!content) continue
    if (/@supabase\/supabase-js/.test(content)) {
      evidence.push('Found supabase-js import in source files')
      return 'supabase'
    }
    if (/@prisma\/client/.test(content)) {
      evidence.push('Found Prisma client import')
      return 'prisma'
    }
    if (/drizzle-orm/.test(content)) {
      evidence.push('Found drizzle-orm import')
      return 'drizzle'
    }
    if (/knex/.test(content)) {
      evidence.push('Found knex import')
      return 'knex'
    }
  }

  // Check for SQL migration directories
  const sqlDirs = ['.', 'supabase/migrations', 'migrations', 'db/migrations']
  for (const dir of sqlDirs) {
    const fullPath = join(projectDir, dir)
    if (existsSync(fullPath)) {
      const sqlFiles = findFiles(fullPath, { extensions: ['.sql'] })
      if (sqlFiles.length > 0) {
        evidence.push(`Found ${sqlFiles.length} SQL migration files in ${dir}/`)
        return 'raw-sql'
      }
    }
  }

  evidence.push('No ORM or database tool detected')
  return 'unknown'
}

function discoverTables(
  projectDir: string,
  sourceFiles: string[],
  orm: DatabaseInfo['orm'],
  evidence: string[],
): TableInfo[] {
  const tableMap = new Map<string, TableInfo>()

  if (orm === 'supabase' || orm === 'raw-sql') {
    // Parse SQL migration files
    const sqlFiles = findFiles(projectDir, { extensions: ['.sql'] })
      .filter(f => !f.includes('node_modules'))

    for (const file of sqlFiles) {
      const content = readFileSafe(file)
      if (!content) continue

      let match: RegExpExecArray | null
      CREATE_TABLE_RE.lastIndex = 0
      while ((match = CREATE_TABLE_RE.exec(content)) !== null) {
        const tableName = match[1]
        if (SYSTEM_TABLES.has(tableName)) continue

        // Get columns for this table
        const block = extractCreateBlock(content, match.index)
        const columns = parseColumns(block)

        const existing: TableInfo = tableMap.get(tableName) || {
          name: tableName,
          hasTenantId: false,
          referencesTenants: false,
          hasUserId: false,
          hasOrgId: false,
          columnCount: 0,
          sourceFile: file,
          tenantScopeScore: 0,
        }

        existing.columnCount = columns.length
        existing.hasTenantId = columns.some(c => /tenant_id/i.test(c))
        existing.referencesTenants = /references\s+tenants\s*\(/i.test(block)
        existing.hasUserId = columns.some(c => /^user_id$/i.test(c))
        existing.hasOrgId = columns.some(c => /^(organization_id|org_id|team_id|workspace_id)$/i.test(c))

        // Calculate tenant scope score
        existing.tenantScopeScore = calculateTenantScore(existing, tableName)
        tableMap.set(tableName, existing)
      }
    }
  }

  if (orm === 'prisma') {
    // Parse Prisma schema files
    const prismaFiles = findFiles(projectDir, { extensions: ['.prisma'] })
    for (const file of prismaFiles) {
      const content = readFileSafe(file)
      if (!content) continue

      // Use exec in a loop instead of matchAll for compatibility
      const modelRe = /model\s+(\w+)\s*{/g
      let m: RegExpExecArray | null
      while ((m = modelRe.exec(content)) !== null) {
        const tableName = m[1]
        if (SYSTEM_TABLES.has(tableName)) continue

        // Get block
        const block = extractModelBlock(content, m.index!)
        const columns = parsePrismaColumns(block)

        const existing: TableInfo = tableMap.get(tableName) || {
          name: tableName,
          hasTenantId: false,
          referencesTenants: false,
          hasUserId: false,
          hasOrgId: false,
          columnCount: 0,
          sourceFile: file,
          tenantScopeScore: 0,
        }

        existing.columnCount = columns.length
        existing.hasTenantId = columns.some(c => /tenant/i.test(c))
        existing.referencesTenants = /tenants\s*\(/.test(block)
        existing.hasUserId = columns.some(c => /^userId$/i.test(c) || /^user_id$/i.test(c) || c === 'userId')
        existing.hasOrgId = columns.some(c => /^(organizationId|orgId|teamId|workspaceId)$/i.test(c))

        existing.tenantScopeScore = calculateTenantScore(existing, tableName)
        tableMap.set(tableName, existing)
      }
    }
  }

  // Convert to sorted array
  const tables = Array.from(tableMap.values())
    .sort((a, b) => b.tenantScopeScore - a.tenantScopeScore)

  evidence.push(`Found ${tables.length} application tables`)
  const readyCount = tables.filter(t => t.hasTenantId).length
  if (readyCount > 0) {
    evidence.push(`${readyCount} tables already have tenant_id`)
  }
  const needsMigration = tables.filter(t => !t.hasTenantId && t.tenantScopeScore > 0.5).length
  if (needsMigration > 0) {
    evidence.push(`${needsMigration} tables need tenant_id migration`)
  }

  return tables
}

function calculateTenantScore(table: TableInfo, name: string): number {
  let score = 0

  // Already has tenant_id → likely already migrated
  if (table.hasTenantId) score += 0.35
  if (table.referencesTenants) score += 0.3
  if (table.hasUserId) score += 0.15
  if (table.hasOrgId) score += 0.2

  // Name-based heuristics
  for (const pattern of TENANT_LIKELY_NAMES) {
    if (pattern.test(name)) {
      score += 0.15
      break
    }
  }

  // Tables with more columns are more likely to be application tables
  if (table.columnCount >= 3) score += 0.05
  if (table.columnCount >= 6) score += 0.05

  return Math.min(score, 1)
}

function parseColumns(block: string): string[] {
  const cols: string[] = []
  const lines = block.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    // Skip table constraints, comments, empty lines
    if (!trimmed || trimmed.startsWith('--') || trimmed.startsWith('/*') ||
        /^(create|alter|grant|--|\)|;)/i.test(trimmed) ||
        /^(primary|foreign|unique|check|constraint|index)/i.test(trimmed)) {
      continue
    }
    const colMatch = trimmed.match(/^"?(\w+)"?\s/)
    if (colMatch) {
      cols.push(colMatch[1])
    }
  }
  return cols
}

function parsePrismaColumns(block: string): string[] {
  const cols: string[] = []
  const lines = block.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@') ||
        trimmed.startsWith('enum') || trimmed.startsWith('}') || trimmed.startsWith('{')) {
      continue
    }
    const colMatch = trimmed.match(/^(\w+)\s+/)
    if (colMatch) {
      cols.push(colMatch[1])
    }
  }
  return cols
}

function extractCreateBlock(sql: string, startIdx: number): string {
  // Find the CREATE TABLE block boundaries
  const afterCreate = sql.slice(startIdx)
  const parenStart = afterCreate.indexOf('(')
  if (parenStart === -1) return ''

  let depth = 0
  let block = ''
  for (let i = parenStart; i < afterCreate.length; i++) {
    const ch = afterCreate[i]
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (depth === 0) {
      block = afterCreate.slice(parenStart, i + 1)
      break
    }
  }
  return block
}

function extractModelBlock(content: string, startIdx: number): string {
  const after = content.slice(startIdx)
  const braceStart = after.indexOf('{')
  if (braceStart === -1) return ''

  let depth = 0
  for (let i = braceStart; i < after.length; i++) {
    if (after[i] === '{') depth++
    if (after[i] === '}') depth--
    if (depth === 0) {
      return after.slice(braceStart + 1, i)
    }
  }
  return ''
}

function findDbUrl(sourceFiles: string[]): string | null {
  const patterns = [
    /DATABASE_URL\s*=\s*['"]?postgres(?:ql)?:\/\//,
    /supabaseUrl\s*[:=]\s*['"]https:\/\//,
    /SUPABASE_URL\s*=\s*['"]https:\/\//,
    /connectionString\s*[:=]\s*['"]postgres/,
  ]

  for (const f of sourceFiles.slice(0, 30)) {
    const content = readFileSafe(f)
    if (!content) continue
    for (const p of patterns) {
      if (p.test(content)) return p.source
    }
  }

  // Check .env files
  const envFiles = findFiles(process.cwd(), { filenames: ['.env', '.env.local', '.env.example'] })
  for (const f of envFiles) {
    const content = readFileSafe(f)
    if (content && /postgres(?:ql)?:\/\//.test(content)) {
      return 'Found in .env file'
    }
  }

  return null
}
