// ──────────────────────────────────────────────────────
// @tenantscale/cli — Tenant Readiness Scorer
// ──────────────────────────────────────────────────────

import type { DatabaseInfo } from './database.js'
import type { RouteAnalysis } from './routes.js'
import type { AuthInfo } from './auth.js'
import type { FrameworkInfo } from './framework.js'

export interface ReadinessScore {
  /** Overall readiness (0-100) */
  overall: number
  /** Breakdown by category */
  categories: {
    database: { score: number; max: number; label: string }
    routes: { score: number; max: number; label: string }
    auth: { score: number; max: number; label: string }
    audit: { score: number; max: number; label: string }
    rateLimit: { score: number; max: number; label: string }
  }
  /** Recommended actions, sorted by priority */
  actions: ReadinessAction[]
  /** Summary text */
  summary: string
}

export interface ReadinessAction {
  priority: 'critical' | 'high' | 'medium' | 'low'
  category: string
  title: string
  description: string
  effort: string
}

/**
 * Calculate a tenant-readiness score for the project.
 * Higher = more ready for TenantScale integration.
 */
export function scoreReadiness(
  database: DatabaseInfo,
  routes: RouteAnalysis,
  auth: AuthInfo,
  framework: FrameworkInfo,
): ReadinessScore {
  const actions: ReadinessAction[] = []

  // ── Database readiness (max 30) ──
  let dbScore = 0
  const dbMax = 30

  if (database.orm !== 'unknown') {
    dbScore += 5
  }

  if (database.tables.length > 0) {
    dbScore += 5
  }

  // Already has tenant_id on some tables
  const tenantReadyTables = database.tables.filter((t) => t.hasTenantId).length
  if (tenantReadyTables > 0) {
    dbScore += Math.min(tenantReadyTables * 3, 10)
  }

  // Tables needing migration
  const needsMigration = database.tenantTables.filter((t) => !t.hasTenantId).length
  if (needsMigration === 0 && database.tables.length > 0) {
    dbScore += 10 // fully migrated
  } else if (needsMigration > 0) {
    dbScore += 3 // needs some work

    actions.push({
      priority: 'critical',
      category: 'database',
      title: `Add tenant_id to ${needsMigration} table(s)`,
      description: `Tables: ${database.tenantTables
        .filter((t) => !t.hasTenantId)
        .map((t) => t.name)
        .join(', ')}. Migration SQL will be generated.`,
      effort: needsMigration <= 2 ? '15 minutes' : '30 minutes',
    })
  }

  // RLS already enabled
  if (database.hasExistingRls) {
    dbScore += 5
  } else if (database.tables.length > 0) {
    actions.push({
      priority: 'high',
      category: 'database',
      title: 'Enable Row Level Security on tenant-scoped tables',
      description:
        'RLS policies will be generated for each table to enforce tenant isolation at the database level.',
      effort: '15 minutes',
    })
  }

  // ── Route readiness (max 25) ──
  let routeScore = 0
  const routeMax = 25

  if (routes.totalRoutes > 0) {
    routeScore += 5
  }

  const protectionRatio = routes.totalRoutes > 0 ? routes.protected / routes.totalRoutes : 0
  routeScore += Math.round(protectionRatio * 15)

  if (protectionRatio < 0.5 && routes.totalRoutes > 0) {
    actions.push({
      priority: 'high',
      category: 'routes',
      title: `Add tenant middleware to ${routes.unprotected} unprotected route(s)`,
      description: `${routes.unprotected} of ${routes.totalRoutes} routes lack auth/tenant protection. Middleware will be generated.`,
      effort: routes.unprotected <= 5 ? '10 minutes' : '30 minutes',
    })
  }

  // ── Auth readiness (max 20) ──
  let authScore = 0
  const authMax = 20

  if (auth.approach !== 'none') {
    authScore += 5
  }

  if (auth.middlewareFiles.length > 0) {
    authScore += 5
  }

  if (auth.compatibleWithTenantScale) {
    authScore += 5
  }

  if (auth.library) {
    authScore += 5
  }

  if (auth.approach === 'none') {
    actions.push({
      priority: 'critical',
      category: 'auth',
      title: 'Implement API key or JWT-based authentication',
      description:
        'No authentication detected. TenantScale requires API keys or Supabase sessions for tenant isolation.',
      effort: '1-2 hours',
    })
  }

  // ── Audit readiness (max 15) ──
  let auditScore = 0
  const auditMax = 15

  // We'll compute this from available data
  if (database.tables.some((t) => t.name === 'audit_events' || t.name === 'audit_logs')) {
    auditScore += 10
  }
  if (
    routes.evidence.some(
      (e) => e.toLowerCase().includes('audit') || e.toLowerCase().includes('log'),
    )
  ) {
    auditScore += 5
  }

  // Look for audit patterns in route analysis
  const routeEvidence = routes.evidence.join(' ').toLowerCase()
  if (routeEvidence.includes('audit')) {
    auditScore = Math.max(auditScore, 5)
  }

  if (auditScore < 5) {
    actions.push({
      priority: 'medium',
      category: 'audit',
      title: 'Add audit logging for tenant operations',
      description:
        'No audit log table or audit events detected. TenantScale can add structured audit logging for compliance.',
      effort: '30 minutes',
    })
  }

  // ── Rate limiting readiness (max 10) ──
  let rateScore = 0
  const rateMax = 10

  const rateEvidence = routes.evidence.join(' ').toLowerCase()
  if (
    rateEvidence.includes('rate') ||
    rateEvidence.includes('limit') ||
    rateEvidence.includes('throttle')
  ) {
    rateScore += 5
  }

  // Check source files for rate limiting
  if (hasRateLimitPattern()) {
    rateScore += 5
  }

  if (rateScore < 5) {
    actions.push({
      priority: 'medium',
      category: 'rate-limit',
      title: 'Configure per-tenant rate limiting',
      description:
        'No rate limiting detected. TenantScale can add plan-based rate limiting per tenant.',
      effort: '15 minutes',
    })
  }

  // ── Overall score ──
  const maxPossible = dbMax + routeMax + authMax + auditMax + rateMax
  const total = dbScore + routeScore + authScore + auditScore + rateScore
  const overall = Math.round((total / maxPossible) * 100)

  // ── Summary ──
  let summary: string
  if (overall >= 70) {
    summary =
      'Your project is mostly ready for tenant isolation. A few migrations and middleware additions needed.'
  } else if (overall >= 40) {
    summary =
      'Your project has some multi-tenant foundations. The generated migration plan will get you the rest of the way.'
  } else {
    summary =
      'Your project needs significant work to add tenant isolation. The generated plan provides a step-by-step guide.'
  }

  if (needsMigration > 0) {
    actions.push({
      priority: 'high',
      category: 'database',
      title: 'Backfill tenant_id for existing rows',
      description:
        'After adding columns, migrate existing data to associate rows with the correct tenant.',
      effort: '1-2 hours (depends on data volume)',
    })
  }

  // Sort actions by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
  actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])

  return {
    overall,
    categories: {
      database: { score: dbScore, max: dbMax, label: 'Database Schema' },
      routes: { score: routeScore, max: routeMax, label: 'Route Protection' },
      auth: { score: authScore, max: authMax, label: 'Authentication' },
      audit: { score: auditScore, max: auditMax, label: 'Audit Logging' },
      rateLimit: { score: rateScore, max: rateMax, label: 'Rate Limiting' },
    },
    actions,
    summary,
  }
}

// These are assigned at module level so they can be replaced in tests
let sourceFilesContain = (): boolean => false
let hasRateLimitPattern = (): boolean => false

/**
 * Internal: set context for scoring. Called from migrate.ts.
 */
export function __setScoreContext(sourceFn: () => boolean, rateFn: () => boolean): void {
  sourceFilesContain = sourceFn
  hasRateLimitPattern = rateFn
}
