// ──────────────────────────────────────────────────────
// @tenantscale/cli — Migration Report Generator
// ──────────────────────────────────────────────────────

import type { FrameworkInfo } from '../analyzers/framework.js'
import type { DatabaseInfo } from '../analyzers/database.js'
import type { RouteAnalysis } from '../analyzers/routes.js'
import type { AuthInfo } from '../analyzers/auth.js'
import type { ReadinessScore } from '../analyzers/readiness.js'

export interface ReportResult {
  files: { path: string; content: string; description: string }[]
}

/**
 * Generate the migration report (README.md) and machine-readable plan.json.
 */
export function generateReport(
  framework: FrameworkInfo,
  database: DatabaseInfo,
  routes: RouteAnalysis,
  auth: AuthInfo,
  readiness: ReadinessScore,
  outputDir: string,
): ReportResult {
  const timestamp = new Date().toISOString().split('T')[0]

  const markdown = generateMarkdown(
    timestamp,
    outputDir,
    framework,
    database,
    routes,
    auth,
    readiness,
  )
  const planJson = generatePlanJson(timestamp, framework, database, routes, auth, readiness)

  return {
    files: [
      {
        path: `${outputDir}/README.md`,
        content: markdown,
        description: 'Full migration report',
      },
      {
        path: `${outputDir}/plan.json`,
        content: planJson,
        description: 'Machine-readable analysis (CI/automation)',
      },
    ],
  }
}

function generateMarkdown(
  timestamp: string,
  outputDir: string,
  framework: FrameworkInfo,
  database: DatabaseInfo,
  routes: RouteAnalysis,
  auth: AuthInfo,
  readiness: ReadinessScore,
): string {
  const needsMigration = database.tenantTables.filter((t) => !t.hasTenantId)

  let md = `# TenantScale Migration Report

Generated: ${timestamp}
Framework: ${framework.framework} ${framework.confidence < 1 ? `(detected with ${Math.round(framework.confidence * 100)}% confidence)` : ''}
ORM:       ${database.orm}

## Readiness Score: ${readiness.overall}/100

${readiness.summary}

### Category Breakdown

| Category | Score | Status |
|----------|-------|--------|
`

  for (const [_, cat] of Object.entries(readiness.categories)) {
    const pct = cat.max > 0 ? Math.round((cat.score / cat.max) * 100) : 0
    const icon = pct >= 80 ? '✅' : pct >= 50 ? '⚠️' : '❌'
    md += `| ${cat.label} | ${cat.score}/${cat.max} (${pct}%) | ${icon} |\n`
  }

  md += `\n## Recommended Actions\n\n`

  if (readiness.actions.length === 0) {
    md += `No actions needed — your project appears ready for TenantScale!\n`
  } else {
    for (const action of readiness.actions) {
      const priorityIcon =
        action.priority === 'critical'
          ? '🔴'
          : action.priority === 'high'
            ? '🟡'
            : action.priority === 'medium'
              ? '🔵'
              : '⚪'
      md += `### ${priorityIcon} [${action.priority.toUpperCase()}] ${action.title}\n\n`
      md += `${action.description}\n\n`
      md += `> Estimated effort: ${action.effort}\n\n`
    }
  }

  md += `## Database Changes\n\n`

  if (needsMigration.length === 0) {
    md += `No database changes needed. All tables already have tenant isolation.\n`
  } else {
    md += `| Table | Has tenant_id? | Action |\n`
    md += `|-------|---------------|--------|\n`
    for (const table of needsMigration) {
      md += `| ${table.name} | ❌ | Add tenant_id column + RLS |\n`
    }
    for (const table of database.tables.filter((t) => t.hasTenantId)) {
      md += `| ${table.name} | ✅ | Already migrated |\n`
    }
  }

  md += `\n## Route Analysis\n\n`

  if (routes.totalRoutes === 0) {
    md += `No route definitions detected.\n`
  } else {
    md += `| Status | Count |\n`
    md += `|--------|-------|\n`
    md += `| Total routes | ${routes.totalRoutes} |\n`
    md += `| Protected | ${routes.protected} |\n`
    md += `| Unprotected | ${routes.unprotected} |\n\n`

    if (routes.unprotected > 0) {
      md += `### Unprotected Routes\n\n`
      md += `| File | Method | Path |\n`
      md += `|------|--------|------|\n`
      for (const route of routes.routes.filter((r) => !r.hasAuth)) {
        md += `| ${shortPath(route.file)} | ${route.method} | ${route.path} |\n`
      }
      md += '\n'
    }

    md += `### Route Files\n\n`
    for (const file of routes.filesWithRoutes) {
      md += `- ${shortPath(file)}\n`
    }
  }

  md += `\n## Authentication\n\n`

  md += `| Property | Value |\n`
  md += `|----------|-------|\n`
  md += `| Approach | ${auth.approach} |\n`
  md += `| Library  | ${auth.library ?? 'None detected'} |\n`
  md += `| Compatible with TenantScale | ${auth.compatibleWithTenantScale ? '✅ Yes' : '⚠️ May need adapter'} |\n`

  if (auth.middlewareFiles.length > 0) {
    md += `\n### Auth Middleware Files\n\n`
    for (const file of auth.middlewareFiles) {
      md += `- ${shortPath(file)}\n`
    }
  }

  md += `\n## Generated Artifacts\n\n`

  md += `| File | Purpose |\n`
  md += `|------|---------|\n`
  md += `| ${outputDir}/001_add_tenant_id.sql | Add tenant_id columns + indexes |\n`
  md += `| ${outputDir}/002_rls_policies.sql | RLS policies for tenant isolation |\n`
  md += `| ${outputDir}/003_seed_plans.sql | Seed plan tiers |\n`
  md += `| ${outputDir}/tenant-middleware.ts | Drop-in tenant middleware |\n`
  md += `| ${outputDir}/.env.tenantscale | Environment variable template |\n`

  md += `\n## Next Steps\n\n`

  md += `1. **Review the generated artifacts** — verify table names and middleware match your codebase\n`
  md += `2. **Install packages** — \`npm install @tenantscale/sdk @tenantscale/${framework.framework}\`\n`
  md += `3. **Run migrations** — \`npx supabase db push\` or apply SQL files manually\n`
  md += `4. **Add middleware** — import the generated middleware into your app entry point\n`
  md += `5. **Create a test tenant** — sign up through your app and verify tenant isolation\n`

  md += `\n---\n*Generated by @tenantscale/cli migrate*`

  return md
}

function generatePlanJson(
  timestamp: string,
  framework: FrameworkInfo,
  database: DatabaseInfo,
  routes: RouteAnalysis,
  auth: AuthInfo,
  readiness: ReadinessScore,
): string {
  const plan = {
    schemaVersion: '1.0',
    generatedAt: timestamp,
    tool: '@tenantscale/cli migrate',
    project: {
      framework: framework.framework,
      isMonorepo: framework.isMonorepo,
      orm: database.orm,
    },
    analysis: {
      readiness: {
        overall: readiness.overall,
        categories: Object.fromEntries(
          Object.entries(readiness.categories).map(([k, v]) => [
            k,
            { score: v.score, max: v.max, label: v.label },
          ]),
        ),
        actions: readiness.actions.map((a) => ({
          priority: a.priority,
          category: a.category,
          title: a.title,
        })),
      },
      database: {
        totalTables: database.tables.length,
        tenantTables: database.tenantTables.map((t) => ({
          name: t.name,
          needsMigration: !t.hasTenantId,
        })),
      },
      routes: {
        total: routes.totalRoutes,
        protected: routes.protected,
        unprotected: routes.unprotected,
      },
      auth: {
        approach: auth.approach,
        hasMiddleware: auth.middlewareFiles.length > 0,
        compatible: auth.compatibleWithTenantScale,
      },
    },
    generatedArtifacts: [
      '001_add_tenant_id.sql',
      '002_rls_policies.sql',
      '003_seed_plans.sql',
      'tenant-middleware.ts',
      '.env.tenantscale',
    ],
  }

  return JSON.stringify(plan, null, 2)
}

function shortPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  // Try to get a relative path from src/
  const srcIdx = normalized.indexOf('/src/')
  if (srcIdx !== -1) return 'src/' + normalized.slice(srcIdx + 5)
  return normalized.split('/').slice(-3).join('/')
}
