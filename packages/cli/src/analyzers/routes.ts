// ──────────────────────────────────────────────────────
// @tenantscale/cli — Route & Handler Analyzer
// ──────────────────────────────────────────────────────
// Scans source files to find route definitions and
// categorize them by framework and protection status.

import { readFileSafe } from '../utils/file-glob.js'
import type { FrameworkInfo } from './framework.js'

export interface RouteInfo {
  file: string
  method: string
  path: string
  lineNumber: number
  /** Does this route already have auth middleware? */
  hasAuth: boolean
  /** Does this route already scope to tenant? */
  hasTenantFilter: boolean
  /** Suggested middleware level */
  suggestedProtection: 'api_key' | 'session' | 'public' | 'plan_check'
}

export interface RouteAnalysis {
  totalRoutes: number
  protected: number
  unprotected: number
  routes: RouteInfo[]
  filesWithRoutes: string[]
  evidence: string[]
}

// HTTP method patterns per framework
const METHOD_PATTERNS: Record<string, RegExp[]> = {
  express: [
    /(app|router|route)\.(get|post|put|patch|delete|all)\s*\(\s*['"`](\/[^'"`]*)['"`]/g,
    /\.route\s*\(\s*['"`](\/[^'"`]*)['"`]\s*\)/g,
  ],
  hono: [
    /(app|router)\.(get|post|put|patch|delete|all)\s*\(\s*['"`](\/[^'"`]*)['"`]/g,
    /\.on\s*\(\s*['"`](GET|POST|PUT|PATCH|DELETE)['"`]\s*,\s*['"`](\/[^'"`]*)['"`]/g,
  ],
  nextjs: [/export\s+(default\s+)?async\s+function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS)\s*\(/g],
  fastify: [/(app|server)\.(get|post|put|patch|delete|all)\s*\(\s*['"`](\/[^'"`]*)['"`]/g],
}

// Patterns that indicate auth/tenant protection
const AUTH_PATTERNS = [
  /authenticate/,
  /requireAuth/,
  /protect/,
  /authMiddleware/,
  /\bverifyToken\b/,
  /\bvalidateSession\b/,
  /middleware\.auth/,
  /\brequireScope\b/,
  /\brequirePortalSession\b/,
]

const TENANT_PATTERNS = [
  /tenant_id/,
  /\btenant\b.*filter/,
  /scopeToTenant/,
  /getTenantContext/,
  /req\.tenant/,
  /c\.get\s*\(\s*['"]tenant['"]\s*\)/,
  /\btenantId\b/,
]

/**
 * Analyze route definitions across the codebase.
 */
export function analyzeRoutes(sourceFiles: string[], framework: FrameworkInfo): RouteAnalysis {
  const routes: RouteInfo[] = []
  const filesWithRoutes: string[] = []
  const evidence: string[] = []

  const fw = framework.framework

  for (const file of sourceFiles) {
    const content = readFileSafe(file)
    if (!content) continue

    const lines = content.split('\n')
    let fileHasRoute = false

    if (fw === 'nextjs') {
      // Next.js App Router: each file is one route handler
      const exportMatch = content.match(
        /export\s+(default\s+)?async\s+function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS)\s*\(/,
      )
      if (exportMatch) {
        fileHasRoute = true
        const method = exportMatch[2]
        const path = inferNextRoutePath(file)

        const hasAuth = AUTH_PATTERNS.some((p) => p.test(content))
        const hasTenant = TENANT_PATTERNS.some((p) => p.test(content))

        routes.push({
          file,
          method,
          path,
          lineNumber: getLineNumber(lines, exportMatch[0]),
          hasAuth,
          hasTenantFilter: hasTenant,
          suggestedProtection: hasAuth ? 'api_key' : hasTenant ? 'session' : 'api_key',
        })
      }
    } else {
      // Express/Hono/Fastify: parse route declarations
      const patterns = METHOD_PATTERNS[fw] || METHOD_PATTERNS['express']

      // Group patterns: static patterns for inline matching, regex patterns for exec loop
      const staticPatterns: RegExp[] = []
      const regexPatterns: RegExp[] = []

      for (const pattern of patterns) {
        if (pattern.flags.includes('g')) {
          // For RegExp with /g flag, we use exec in a loop
          staticPatterns.push(pattern)
        } else {
          regexPatterns.push(pattern)
        }
      }

      // Handle non-global patterns (like the nextjs one)
      for (const pattern of regexPatterns) {
        const match = content.match(pattern)
        if (match) {
          fileHasRoute = true
          const method = match[2]
          const path = '/'
          routes.push({
            file,
            method,
            path,
            lineNumber: 1,
            hasAuth: AUTH_PATTERNS.some((p) => p.test(content)),
            hasTenantFilter: TENANT_PATTERNS.some((p) => p.test(content)),
            suggestedProtection: 'api_key',
          })
        }
      }

      // Handle global patterns with exec loop
      for (const pattern of staticPatterns) {
        const re = new RegExp(pattern.source, 'g')
        let match: RegExpExecArray | null
        while ((match = re.exec(content)) !== null) {
          fileHasRoute = true

          // Extract method and path based on capture groups
          let method: string
          let path: string

          if (fw === 'express' || fw === 'fastify') {
            method = match[2].toUpperCase()
            path = match[3]
          } else if (fw === 'hono' && pattern.source.includes('export')) {
            method = match[2]
            path = match[3]
          } else if (fw === 'hono') {
            method = match[2].toUpperCase()
            path = match[3]
          } else {
            method = 'GET'
            path = '/'
          }

          // Check if this route is near auth middleware (same file)
          const lineNum = getLineNumber(lines, match[0])
          const nearbyLines = lines
            .slice(Math.max(0, lineNum - 5), Math.min(lines.length, lineNum + 5))
            .join('\n')
          const hasAuth = AUTH_PATTERNS.some((p) => p.test(nearbyLines) || p.test(content))
          const hasTenant = TENANT_PATTERNS.some((p) => p.test(nearbyLines))

          routes.push({
            file,
            method,
            path,
            lineNumber: lineNum,
            hasAuth,
            hasTenantFilter: hasTenant,
            suggestedProtection:
              path.startsWith('/api/') || path.startsWith('/v') ? 'api_key' : 'session',
          })
        }
      }
    }

    if (fileHasRoute && !filesWithRoutes.includes(file)) {
      filesWithRoutes.push(file)
    }
  }

  // Deduplicate
  const uniqueRoutes = routes.filter(
    (r, i, arr) =>
      i === arr.findIndex((x) => x.file === r.file && x.method === r.method && x.path === r.path),
  )

  const protected_count = uniqueRoutes.filter((r) => r.hasAuth || r.hasTenantFilter).length

  evidence.push(
    `Found ${uniqueRoutes.length} route definitions across ${filesWithRoutes.length} files`,
  )
  evidence.push(`${protected_count} routes have auth/tenant protection`)
  evidence.push(`${uniqueRoutes.length - protected_count} routes appear unprotected`)

  return {
    totalRoutes: uniqueRoutes.length,
    protected: protected_count,
    unprotected: uniqueRoutes.length - protected_count,
    routes: uniqueRoutes,
    filesWithRoutes,
    evidence,
  }
}

function getLineNumber(lines: string[], match: string): number {
  // Approximate: find the first line containing the match
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(match.substring(0, 20))) return i + 1
  }
  return 1
}

function inferNextRoutePath(filePath: string): string {
  // Convert src/app/api/projects/route.ts → /api/projects
  const normalized = filePath.replace(/\\/g, '/')
  const match = normalized.match(/\/(?:src\/)?app\/(.+)\/route\.(ts|js)$/)
  if (match) {
    return '/' + match[1]
  }
  return '/' + normalized.split('/').slice(-2, -1)[0] || '/unknown'
}
