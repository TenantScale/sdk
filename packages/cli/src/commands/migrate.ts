// ──────────────────────────────────────────────────────
// @tenantscale/cli — migrate command
// ──────────────────────────────────────────────────────

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, relative, join } from 'node:path'
import pc from 'picocolors'
import { createLogger } from '../utils/logger.js'
import { confirm, select, multiSelect } from '../utils/prompt.js'
import { findSourceFiles, readFileSafe } from '../utils/file-glob.js'
import { detectFramework } from '../analyzers/framework.js'
import { analyzeDatabase } from '../analyzers/database.js'
import { analyzeRoutes } from '../analyzers/routes.js'
import { analyzeAuth } from '../analyzers/auth.js'
import { scoreReadiness, __setScoreContext } from '../analyzers/readiness.js'
import { generateMigrationSql } from '../generators/migration-sql.js'
import { generateMiddleware } from '../generators/middleware.js'
import { generateEnvConfig } from '../generators/env.js'
import { generateReport } from '../generators/report.js'

export interface MigrateOptions {
  nonInteractive?: boolean
  reportOnly?: boolean
  output?: string
  framework?: string
  dbType?: string
}

/**
 * Main action for the 'migrate' command.
 * Analyzes an existing codebase and generates tenant isolation migration artifacts.
 */
export async function migrateAction(dirArg?: string, options: MigrateOptions = {}): Promise<void> {
  const logger = createLogger()
  const projectDir = resolve(dirArg || process.cwd())

  // ── Welcome ──
  console.log('')
  console.log(pc.bold(pc.cyan(' TenantScale Migration Analyzer ')))
  console.log(pc.dim(` Analyzing: ${projectDir}`))
  console.log('')

  // ── Validate project directory ──
  if (!existsSync(projectDir)) {
    logger.error(`Directory not found: ${projectDir}`)
    process.exit(1)
  }

  // ── Detect framework interactively or auto ──
  const isInteractive = !options.nonInteractive

  // Find source files first (used by all analyzers)
  const allSourceFiles = findSourceFiles(projectDir)
  logger.info(`Found ${allSourceFiles.length} source files`)

  // Step 1: Framework detection
  const detectedFramework = detectFramework(projectDir, allSourceFiles)

  let frameworkOverride = options.framework
  if (isInteractive && !frameworkOverride) {
    if (detectedFramework.framework !== 'none') {
      const useDetected = await confirm(
        `Detected framework: ${pc.bold(detectedFramework.framework)}. Use this?`,
        true,
      )
      if (!useDetected) {
        const fwChoice = await select(
          'Select framework:',
          [
            { name: 'Express', value: 'express' },
            { name: 'Hono', value: 'hono' },
            { name: 'Next.js', value: 'nextjs' },
            { name: 'Fastify', value: 'fastify' },
            { name: 'None / Other', value: 'none' },
          ],
          detectedFramework.framework,
        )
        frameworkOverride = fwChoice
      }
    } else {
      logger.warn('Could not auto-detect framework.')
      const fwChoice = await select('Select your framework:', [
        { name: 'Express', value: 'express' },
        { name: 'Hono', value: 'hono' },
        { name: 'Next.js', value: 'nextjs' },
        { name: 'Fastify', value: 'fastify' },
        { name: 'None / Other', value: 'none' },
      ])
      frameworkOverride = fwChoice
    }
  }

  const framework = frameworkOverride
    ? { ...detectedFramework, framework: frameworkOverride as any }
    : detectedFramework

  logger.info(`Framework: ${pc.bold(framework.framework)}`)

  // Step 2: Database analysis
  const database = analyzeDatabase(projectDir, allSourceFiles)

  if (database.orm === 'unknown') {
    logger.warn('Could not detect a database ORM. Database analysis will be limited.')
  } else {
    logger.info(`Database ORM: ${pc.bold(database.orm)}`)
    logger.info(
      `Found ${database.tables.length} table(s), ${database.tenantTables.length} may need tenant isolation`,
    )

    if (isInteractive && database.tenantTables.length > 0) {
      const tableChoices = database.tenantTables.map((t) => ({
        name: `${t.name}${t.hasTenantId ? pc.green(' (already has tenant_id)') : ''}`,
        value: t.name,
        checked: !t.hasTenantId,
      }))
      if (tableChoices.length > 0) {
        const selected = await multiSelect('Which tables are tenant-scoped?', tableChoices)
        // Filter to only selected tables
        database.tenantTables = database.tenantTables.filter((t) => selected.includes(t.name))
      }
    }
  }

  // Step 3: Route analysis
  const routes = analyzeRoutes(allSourceFiles, framework)

  if (routes.totalRoutes > 0) {
    logger.info(`Found ${routes.totalRoutes} route(s) in ${routes.filesWithRoutes.length} file(s)`)
    if (routes.unprotected > 0) {
      logger.warn(`${routes.unprotected} route(s) appear unprotected`)
    }
  }

  // Step 4: Auth analysis
  const auth = analyzeAuth(allSourceFiles, framework)

  if (auth.approach !== 'none') {
    logger.info(`Auth approach: ${pc.bold(auth.approach)}`)
  } else {
    logger.warn('No authentication detected')
  }

  // Step 5: Readiness scoring
  // Set up context functions for readiness scoring
  const allSourceContent = allSourceFiles
    .slice(0, 40)
    .map((f) => readFileSafe(f) || '')
    .join('\n')

  __setScoreContext(
    () => allSourceContent.toLowerCase().includes('audit'),
    () => {
      const ratePatterns = [/rate.?limit/i, /express-rate-limit/i, /rateLimiter/, /throttle/]
      return ratePatterns.some((p) => p.test(allSourceContent))
    },
  )

  const readiness = scoreReadiness(database, routes, auth, framework)

  // ── Output directory ──
  const outputDir = resolve(
    options.output && options.output !== './tenantscale/migrate'
      ? options.output
      : join(projectDir, 'tenantscale', 'migrate'),
  )

  // ── Generate artifacts ──
  if (!options.reportOnly) {
    // Confirm generation
    let shouldGenerate = true
    if (isInteractive) {
      shouldGenerate = await confirm('Generate migration artifacts?', true)
    }

    if (shouldGenerate) {
      // Create output directory
      mkdirSync(outputDir, { recursive: true })

      // Generate SQL migrations
      const sqlResult = generateMigrationSql(database, outputDir)
      for (const file of sqlResult.files) {
        writeFileSync(file.path, file.content, 'utf-8')
        logger.success(`Created ${relative(projectDir, file.path)}`)
      }

      // Generate middleware
      const mwResult = generateMiddleware(framework, database, outputDir)
      for (const file of mwResult.files) {
        writeFileSync(file.path, file.content, 'utf-8')
        logger.success(`Created ${relative(projectDir, file.path)}`)
      }

      // Generate env config
      const envResult = generateEnvConfig(outputDir)
      for (const file of envResult.files) {
        writeFileSync(file.path, file.content, 'utf-8')
        logger.success(`Created ${relative(projectDir, file.path)}`)
      }

      // Generate report
      const reportResult = generateReport(framework, database, routes, auth, readiness, outputDir)
      for (const file of reportResult.files) {
        writeFileSync(file.path, file.content, 'utf-8')
        logger.success(`Created ${relative(projectDir, file.path)}`)
      }
    }
  }

  // ── Display summary ──
  console.log('')
  console.log(pc.bgCyan(pc.black(' ANALYSIS COMPLETE ')))
  console.log('')
  console.log(pc.bold('Readiness Score: ') + formatScore(readiness.overall))
  console.log('')

  // Display category scores
  for (const [key, cat] of Object.entries(readiness.categories)) {
    const pct = cat.max > 0 ? Math.round((cat.score / cat.max) * 100) : 0
    const bar = formatBar(pct)
    console.log(`  ${pc.dim(key.padEnd(12))} ${bar} ${pc.dim(`${cat.score}/${cat.max}`)}`)
  }

  console.log('')
  console.log(readiness.summary)
  console.log('')

  // Display top actions
  if (readiness.actions.length > 0) {
    console.log(pc.bold(pc.cyan('Recommended actions:')))
    for (const action of readiness.actions.slice(0, 5)) {
      const icon =
        action.priority === 'critical'
          ? pc.red('●')
          : action.priority === 'high'
            ? pc.yellow('●')
            : pc.blue('●')
      console.log(`  ${icon} ${action.title}`)
    }
    if (readiness.actions.length > 5) {
      console.log(
        `  ${pc.dim(`...and ${readiness.actions.length - 5} more. See README.md for details.`)}`,
      )
    }
  }

  console.log('')
  console.log(pc.dim('Generated artifacts:'))
  console.log(pc.dim(`  ${outputDir}/`))
  console.log(pc.dim(`  ├── README.md          — Full migration report`))
  console.log(pc.dim(`  ├── 001_add_tenant_id.sql`))
  console.log(pc.dim(`  ├── 002_rls_policies.sql`))
  console.log(pc.dim(`  ├── 003_seed_plans.sql`))
  console.log(pc.dim(`  ├── tenant-middleware.ts`))
  console.log(pc.dim(`  ├── .env.tenantscale`))
  console.log(pc.dim(`  └── plan.json           — Machine-readable analysis`))
  console.log('')
  console.log(pc.cyan('Next steps:'))
  console.log(
    `  ${pc.cyan('1.')} ${pc.dim('Review the report:')} cat ${relative(projectDir, outputDir)}/README.md`,
  )
  console.log(
    `  ${pc.cyan('2.')} ${pc.dim('Install packages:')} npm install @tenantscale/sdk @tenantscale/${framework.framework}`,
  )
  console.log(`  ${pc.cyan('3.')} ${pc.dim('Apply migrations:')} npx supabase db push`)
  console.log(
    `  ${pc.cyan('4.')} ${pc.dim('Add middleware:')} import from '${relative(projectDir, outputDir)}/tenant-middleware'`,
  )
  console.log('')
}

function formatScore(score: number): string {
  if (score >= 70) return pc.green(`${score}/100`)
  if (score >= 40) return pc.yellow(`${score}/100`)
  return pc.red(`${score}/100`)
}

function formatBar(pct: number, width = 15): string {
  if (!isFinite(pct) || pct < 0) pct = 0
  const filled = Math.round((pct / 100) * width)
  const empty = Math.max(0, width - filled)
  const color = pct >= 80 ? pc.bgGreen : pct >= 50 ? pc.bgYellow : pct >= 0 ? pc.dim : pc.dim
  return color(' '.repeat(filled)) + pc.dim('─'.repeat(empty))
}
