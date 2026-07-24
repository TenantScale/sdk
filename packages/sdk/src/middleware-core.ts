// ──────────────────────────────────────────────────────
// @tenantscale/sdk — Middleware Core (framework-agnostic)
// ──────────────────────────────────────────────────────
//
// All business logic for middleware functions lives here.
// Framework adapters (Express, Fastify, Hono, Koa) import
// these functions and wrap them with framework-specific
// request/response handling (~12 lines per middleware).
//
// Each function throws a typed TenantScaleError subclass
// on failure. Adapters catch these and convert to the
// framework's error response format.

import {
  AuthenticationError,
  PlanLimitExceededError,
  RateLimitExceededError,
  TenantScaleError,
} from './types.js'
import type { ApiKeyInfo, PortalSessionInfo, TenantScale } from './index.js'

// ── Audit event config for the auditLog middleware ──

export interface AuditLogConfig {
  action: string
  resource: string
  actorType?: 'user' | 'system' | 'admin_api' | 'admin_impersonation'
  /** Adapter-provided extra details from the request (e.g. from getDetails callback) */
  details?: Record<string, unknown>
}

// ── Request metadata passed by adapters ──

export interface RequestMeta {
  url: string
  ip?: string
  userAgent?: string | null
}

// ══════════════════════════════════════════════════════════
// API Key Authentication
// ══════════════════════════════════════════════════════════

/**
 * Validate an API key from a header value.
 *
 * @returns The resolved ApiKeyInfo and tenantId
 * @throws AuthenticationError if header is missing or key is invalid
 */
export async function authenticateApiKeyCore(
  ts: TenantScale,
  token: string | undefined,
  headerName: string,
  audit: boolean,
  meta: RequestMeta,
): Promise<{ apiKey: ApiKeyInfo; tenantId: string }> {
  if (!token) {
    throw new AuthenticationError(`Missing ${headerName} header`)
  }

  const apiKey = await ts.validateApiKey(token)

  // Automatic audit logging on successful auth
  if (audit) {
    ts.logAuditEvent({
      tenant_id: apiKey.tenant_id,
      actor_id: apiKey.key_record_id,
      actor_type: 'admin_api',
      action: 'api_key.authenticated',
      resource: meta.url,
      ip: meta.ip,
      user_agent: meta.userAgent ?? undefined,
    }).catch(() => {
      /* fire-and-forget */
    })
  }

  return { apiKey, tenantId: apiKey.tenant_id }
}

// ══════════════════════════════════════════════════════════
// Scope Enforcement
// ══════════════════════════════════════════════════════════

/**
 * Assert that the authenticated API key has at least one of the required scopes.
 *
 * @throws AuthenticationError if no API key is present
 * @throws AuthorizationError if none of the required scopes are held
 */
export function requireScopeCore(
  ts: TenantScale,
  apiKey: ApiKeyInfo | undefined,
  scopes: string[],
): void {
  if (!apiKey) {
    throw new AuthenticationError('Authentication required')
  }
  ts.requireScope(apiKey, ...scopes)
}

// ══════════════════════════════════════════════════════════
// Portal Session Authentication
// ══════════════════════════════════════════════════════════

/**
 * Validate a portal session JWT from an Authorization header value.
 *
 * @returns The resolved PortalSessionInfo and optional tenantId
 * @throws AuthenticationError if header is missing, malformed, or session is invalid
 */
export async function requirePortalSessionCore(
  ts: TenantScale,
  authHeader: string | undefined,
  headerName: string,
): Promise<{ session: PortalSessionInfo; tenantId: string | null }> {
  if (!authHeader) {
    throw new AuthenticationError(`Missing ${headerName} header`)
  }

  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    throw new AuthenticationError('Invalid authorization header format. Expected: Bearer <token>')
  }

  const jwt = parts[1].trim()
  if (!jwt) {
    throw new AuthenticationError('Empty token')
  }

  const session = await ts.validateSession(jwt)

  return { session, tenantId: session.tenant_id }
}

// ══════════════════════════════════════════════════════════
// Portal Role Enforcement
// ══════════════════════════════════════════════════════════

/**
 * Assert that the portal session has at least one of the required roles.
 *
 * @throws AuthenticationError if no session is present
 * @throws AuthorizationError if none of the required roles are held
 */
export function requirePortalRoleCore(
  ts: TenantScale,
  session: PortalSessionInfo | undefined,
  roles: string[],
): void {
  if (!session) {
    throw new AuthenticationError('Portal session required')
  }
  ts.requirePortalRole(session, ...roles)
}

// ══════════════════════════════════════════════════════════
// Super Admin Enforcement
// ══════════════════════════════════════════════════════════

/**
 * Assert that the portal session is a super admin.
 *
 * @throws AuthenticationError if no session is present
 * @throws AuthorizationError if the user is not a super admin
 */
export function requireSuperAdminCore(
  ts: TenantScale,
  session: PortalSessionInfo | undefined,
): void {
  if (!session) {
    throw new AuthenticationError('Portal session required')
  }
  ts.requireSuperAdmin(session)
}

// ══════════════════════════════════════════════════════════
// Plan Limit Enforcement
// ══════════════════════════════════════════════════════════

/**
 * Check the tenant's plan limit for a given feature.
 *
 * @returns true if allowed (within limit), false if unlimited
 * @throws AuthenticationError if no tenant ID is resolved
 * @throws PlanLimitExceededError if the current count equals or exceeds the limit
 */
export async function requirePlanLimitCore(
  ts: TenantScale,
  tenantId: string | undefined,
  feature: string,
  currentCount: number | (() => number | Promise<number>),
): Promise<boolean> {
  if (!tenantId) {
    throw new AuthenticationError(
      'Tenant ID not resolved. Ensure authenticateApiKey or requirePortalSession runs first.',
    )
  }

  const limit = await ts.plans.getPlanLimit(tenantId, feature)

  // null limit = unlimited
  if (limit === null) return false

  const current = typeof currentCount === 'function' ? await currentCount() : currentCount

  if (current >= limit) {
    throw new PlanLimitExceededError(limit, current, feature)
  }

  return true
}

// ══════════════════════════════════════════════════════════
// Rate Limiting
// ══════════════════════════════════════════════════════════

/**
 * Check the plan-based daily API rate limit for an authenticated API key.
 *
 * @throws AuthenticationError if no API key is present
 * @throws RateLimitExceededError if the daily limit is exceeded
 */
export async function rateLimitByApiKeyCore(
  ts: TenantScale,
  apiKey: ApiKeyInfo | undefined,
): Promise<{ remaining: number; limit: number }> {
  if (!apiKey) {
    throw new AuthenticationError('Authentication required for rate limiting')
  }

  const result = await ts.rateLimiter.checkDailyLimit(apiKey)

  if (!result.allowed) {
    throw new RateLimitExceededError(result.limit)
  }

  return { remaining: result.remaining, limit: result.limit }
}

/**
 * Check the IP-based creation rate limit.
 *
 * Attaches a `retryAfter` (number) property to the thrown error
 * so adapters can set the Retry-After response header.
 *
 * @throws TenantScaleError with code IP_RATE_LIMITED if the IP rate limit is exceeded
 */
export async function rateLimitByIpCore(
  ts: TenantScale,
  ip: string,
): Promise<{ remaining: number; resetAtMs: number }> {
  const result = await ts.rateLimiter.checkIpCreationLimit(ip)

  if (result.blocked) {
    const rawRetryAfter = Math.ceil((result.resetAtMs - Date.now()) / 1000)
    const clampedRetryAfter = Math.max(1, rawRetryAfter)
    const err = new TenantScaleError(
      `IP rate limit exceeded. Try again in ${clampedRetryAfter}s.`,
      'IP_RATE_LIMITED',
      429,
    )
    ;(err as any).retryAfter = clampedRetryAfter
    throw err
  }

  return { remaining: result.remaining, resetAtMs: result.resetAtMs }
}

// ══════════════════════════════════════════════════════════
// Audit Logging
// ══════════════════════════════════════════════════════════

/**
 * Log an audit event for the current request (fire-and-forget).
 *
 * Silently skips if no tenant ID is resolved.
 * Audit failures never throw — they log and swallow.
 */
export function auditLogCore(
  ts: TenantScale,
  tenantId: string | undefined,
  config: AuditLogConfig,
  meta: {
    ip?: string
    userAgent?: string | null
    actorId?: string | null
    session?: PortalSessionInfo | null
    apiKey?: ApiKeyInfo | null
  },
): void {
  if (!tenantId) return

  const actorId = meta.actorId ?? meta.session?.user_id ?? meta.apiKey?.created_by ?? null
  const actorType = config.actorType ?? (meta.session ? 'user' : 'admin_api')

  ts.logAuditEvent({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: actorType,
    action: config.action,
    resource: config.resource,
    details: config.details ?? {},
    ip: meta.ip,
    user_agent: meta.userAgent ?? null,
  }).catch((err) => {
    ts.logger.error('Audit log write failed:', err)
  })
}
