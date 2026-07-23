// ──────────────────────────────────────────────────────
// @tenantscale/hono — Middleware
// ──────────────────────────────────────────────────────
//
// Hono middleware functions wrapping the TenantScale SDK.
// Each middleware function accepts HonoAdapterOptions and
// returns a Hono-compatible MiddlewareHandler.
//
// Usage:
// ```ts
// import { Hono } from 'hono'
// import { authenticateApiKey, errorHandler } from '@tenantscale/hono'
//
// const app = new Hono()
// app.use('/api/*', authenticateApiKey({ ts }))
// app.use('/api/admin/*', requireScope({ ts }, 'admin'))
// app.onError(errorHandler({ ts }))
// ```

import type { Context, Next } from 'hono'
import {
  PlanLimitExceededError,
  RateLimitExceededError,
  AuthenticationError,
  AuthorizationError,
} from '@tenantscale/sdk'
import type { HonoAdapterOptions } from './types.js'

// ── Helper: resolve client IP ──

function resolveClientIp(c: Context): string {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    c.req.header('x-real-ip') ??
    '127.0.0.1'
  )
}

// ── Helper: get header (case-insensitive, but Hono lowercases) ──

function getHeader(c: Context, name: string): string | undefined {
  return c.req.header(name)
}

// ──────────────────────────────────────────────────────
// API Key Authentication
// ──────────────────────────────────────────────────────

/**
 * Middleware that authenticates requests using an API key.
 *
 * Reads the API key from `Authorization: Bearer <token>` header,
 * validates it via the SDK, and stores the result in Hono context
 * under `c.get('apiKey')`.
 *
 * Usage:
 * ```ts
 * app.use('/api/*', authenticateApiKey({ ts }))
 * ```
 */
export function authenticateApiKey(options: HonoAdapterOptions) {
  const headerName = options.apiKeyHeader ?? 'Authorization'
  const ctxKey = options.apiKeyContextKey ?? 'apiKey'
  const audit = options.audit ?? true

  return async (c: Context, next: Next) => {
    const header = getHeader(c, headerName)

    if (!header?.startsWith('Bearer ')) {
      return c.json(
        {
          error: 'Missing or invalid Authorization header',
          code: 'AUTH_FAILED',
        },
        401,
      )
    }

    const token = header.slice(7).trim()
    if (!token) {
      return c.json({ error: 'Empty API key', code: 'AUTH_FAILED' }, 401)
    }

    try {
      const keyInfo = await options.ts.validateApiKey(token)

      c.set(ctxKey, keyInfo)
      c.set('tenantId', keyInfo.tenant_id)

      // Automatic audit logging on successful auth
      if (audit) {
        options.ts
          .logAuditEvent({
            tenant_id: keyInfo.tenant_id,
            actor_id: keyInfo.key_record_id,
            actor_type: 'admin_api',
            action: 'api_key.authenticated',
            resource: c.req.path,
            ip: resolveClientIp(c),
            user_agent: c.req.header('user-agent') ?? undefined,
          })
          .catch(() => {
            /* fire-and-forget */
          })
      }

      await next()
    } catch (err) {
      const err_ = err as { code?: string; message?: string; statusCode?: number }
      return c.json(
        {
          error: err_.message ?? 'Invalid API key',
          code: err_.code ?? 'AUTH_FAILED',
        },
        (err_.statusCode ?? 401) as 401 | 403,
      )
    }
  }
}

/**
 * Middleware factory that asserts the authenticated API key
 * has at least one of the required scopes.
 *
 * Must be placed after `authenticateApiKey`.
 *
 * Usage:
 * ```ts
 * app.use('/api/admin/*', authenticateApiKey({ ts }), requireScope({ ts }, 'admin'))
 * ```
 */
export function requireScope(options: HonoAdapterOptions, ...scopes: string[]) {
  const ctxKey = options.apiKeyContextKey ?? 'apiKey'

  return async (c: Context, next: Next) => {
    const apiKey = c.get(ctxKey) as ApiKeyInfo | undefined

    if (!apiKey) {
      return c.json({ error: 'Authentication required' }, 401)
    }

    try {
      options.ts.requireScope(apiKey, ...scopes)
      await next()
    } catch {
      return c.json(
        {
          error: `This endpoint requires one of these scopes: ${scopes.join(', ')}`,
          code: 'MISSING_SCOPE',
        },
        403,
      )
    }
  }
}

// ──────────────────────────────────────────────────────
// Portal Session Authentication
// ──────────────────────────────────────────────────────

/**
 * Middleware that authenticates requests using a portal session JWT.
 *
 * Reads `Authorization: Bearer <token>`, validates the session via the SDK,
 * and stores the result in Hono context under `c.get('portalSession')`.
 *
 * Usage:
 * ```ts
 * app.use('/portal/*', requirePortalSession({ ts }))
 * ```
 */
export function requirePortalSession(options: HonoAdapterOptions) {
  const headerName = options.sessionHeader ?? 'Authorization'
  const ctxKey = options.sessionContextKey ?? 'portalSession'

  return async (c: Context, next: Next) => {
    const header = getHeader(c, headerName)

    if (!header?.startsWith('Bearer ')) {
      return c.json(
        {
          error: 'Missing or invalid Authorization header',
          code: 'AUTH_FAILED',
        },
        401,
      )
    }

    const jwt = header.slice(7).trim()
    if (!jwt) {
      return c.json({ error: 'Empty token', code: 'AUTH_FAILED' }, 401)
    }

    try {
      const session = await options.ts.validateSession(jwt)

      c.set(ctxKey, session)
      if (session.tenant_id) {
        c.set('tenantId', session.tenant_id)
      }

      await next()
    } catch (err) {
      const err_ = err as { code?: string; message?: string; statusCode?: number }
      return c.json(
        {
          error: err_.message ?? 'Invalid session',
          code: err_.code ?? 'SESSION_INVALID',
        },
        (err_.statusCode ?? 401) as 401 | 403,
      )
    }
  }
}

/**
 * Middleware factory that asserts the portal session has
 * at least one of the required roles.
 *
 * Must be placed after `requirePortalSession`.
 *
 * Usage:
 * ```ts
 * app.use('/portal/admin/*', requirePortalSession({ ts }), requirePortalRole({ ts }, 'admin'))
 * ```
 */
export function requirePortalRole(options: HonoAdapterOptions, ...roles: string[]) {
  const ctxKey = options.sessionContextKey ?? 'portalSession'

  return async (c: Context, next: Next) => {
    const session = c.get(ctxKey) as PortalSessionInfo | undefined

    if (!session) {
      return c.json({ error: 'Portal session required' }, 401)
    }

    try {
      options.ts.requirePortalRole(session, ...roles)
      await next()
    } catch {
      return c.json(
        {
          error: `This endpoint requires one of these roles: ${roles.join(', ')}`,
          code: 'MISSING_ROLE',
        },
        403,
      )
    }
  }
}

/**
 * Middleware factory that asserts the portal session is a super admin.
 *
 * Must be placed after `requirePortalSession`.
 *
 * Usage:
 * ```ts
 * app.use('/admin/*', requirePortalSession({ ts }), requireSuperAdmin({ ts }))
 * ```
 */
export function requireSuperAdmin(options: HonoAdapterOptions) {
  const ctxKey = options.sessionContextKey ?? 'portalSession'

  return async (c: Context, next: Next) => {
    const session = c.get(ctxKey) as PortalSessionInfo | undefined

    if (!session) {
      return c.json({ error: 'Portal session required' }, 401)
    }

    try {
      options.ts.requireSuperAdmin(session)
      await next()
    } catch {
      return c.json({ error: 'Super admin access required', code: 'NOT_SUPER_ADMIN' }, 403)
    }
  }
}

// ──────────────────────────────────────────────────────
// Plan Enforcement
// ──────────────────────────────────────────────────────

/**
 * Middleware factory that checks the tenant's plan limit for a feature.
 *
 * Requires `c.get('tenantId')` to be set (via auth middleware first).
 *
 * Usage:
 * ```ts
 * app.post('/api/tenants', authenticateApiKey({ ts }), requirePlanLimit({ ts }, 'max_tenants', 5))
 * ```
 */
export function requirePlanLimit(
  options: HonoAdapterOptions,
  feature: string,
  currentCount: number | ((c: Context) => number | Promise<number>),
) {
  return async (c: Context, next: Next) => {
    const tenantId = c.get('tenantId') as string | undefined

    if (!tenantId) {
      return c.json({ error: 'Tenant ID not resolved' }, 401)
    }

    try {
      const limit = await options.ts.plans.getPlanLimit(tenantId, feature)

      if (limit === null) {
        // Unlimited
        await next()
        return
      }

      const current = typeof currentCount === 'function' ? await currentCount(c) : currentCount

      if (current >= limit) {
        return c.json(
          {
            error: `Plan limit reached: ${feature}. Upgrade your plan to increase this limit.`,
            code: 'PLAN_LIMIT_REACHED',
            details: { limit, current, feature },
          },
          403,
        )
      }

      await next()
    } catch (err) {
      const err_ = err as { code?: string; message?: string; statusCode?: number }
      return c.json(
        {
          error: err_.message ?? 'Plan check failed',
          code: err_.code ?? 'PLAN_ERROR',
        },
        (err_.statusCode ?? 500) as 400 | 403 | 500,
      )
    }
  }
}

// ──────────────────────────────────────────────────────
// Rate Limiting
// ──────────────────────────────────────────────────────

/**
 * Middleware that checks plan-based daily API rate limits for the
 * authenticated API key.
 *
 * Must be placed after `authenticateApiKey`.
 *
 * Usage:
 * ```ts
 * app.use('/api/*', authenticateApiKey({ ts }), rateLimitByApiKey({ ts }))
 * ```
 */
export function rateLimitByApiKey(options: HonoAdapterOptions) {
  const ctxKey = options.apiKeyContextKey ?? 'apiKey'

  return async (c: Context, next: Next) => {
    const apiKey = c.get(ctxKey) as ApiKeyInfo | undefined

    if (!apiKey) {
      return c.json({ error: 'Authentication required' }, 401)
    }

    try {
      const result = await options.ts.rateLimiter.checkDailyLimit(apiKey)

      c.header('X-RateLimit-Limit-Daily', result.limit.toString())
      c.header('X-RateLimit-Remaining-Daily', String(result.remaining))

      if (!result.allowed) {
        return c.json(
          {
            error: `Daily API call limit reached (${result.limit}). Upgrade your plan for more.`,
            code: 'DAILY_LIMIT_EXCEEDED',
            details: { planLimit: result.limit },
          },
          429,
        )
      }

      await next()
    } catch (err) {
      const err_ = err as { code?: string; message?: string; statusCode?: number }
      return c.json(
        {
          error: err_.message ?? 'Rate limit check failed',
          code: err_.code ?? 'RATE_LIMIT_ERROR',
        },
        (err_.statusCode ?? 500) as 400 | 429 | 500,
      )
    }
  }
}

/**
 * Middleware that checks IP-based creation rate limiting.
 *
 * Useful for signup endpoints and public mutation routes.
 *
 * Usage:
 * ```ts
 * app.post('/signup', rateLimitByIp({ ts }))
 * ```
 */
export function rateLimitByIp(options: HonoAdapterOptions) {
  return async (c: Context, next: Next) => {
    const ip = resolveClientIp(c)

    try {
      const result = await options.ts.rateLimiter.checkIpCreationLimit(ip)

      if (result.blocked) {
        const retryAfter = Math.ceil((result.resetAtMs - Date.now()) / 1000)
        c.header('Retry-After', String(Math.max(1, retryAfter)))
        return c.json(
          {
            error: `IP rate limit exceeded. Try again in ${Math.max(1, retryAfter)}s.`,
            code: 'IP_RATE_LIMITED',
          },
          429,
        )
      }

      await next()
    } catch (err) {
      const err_ = err as { code?: string; message?: string; statusCode?: number }
      return c.json(
        {
          error: err_.message ?? 'Rate limit check failed',
          code: err_.code ?? 'RATE_LIMIT_ERROR',
        },
        (err_.statusCode ?? 500) as 400 | 429 | 500,
      )
    }
  }
}

// ──────────────────────────────────────────────────────
// Audit Logging
// ──────────────────────────────────────────────────────

/**
 * Middleware factory that logs an audit event for the current request.
 *
 * Requires `c.get('tenantId')` to be set (via auth middleware first).
 *
 * Usage:
 * ```ts
 * app.post('/api/tenants', authenticateApiKey({ ts }), auditLog({ ts }, {
 *   action: 'tenant.create',
 *   resource: 'tenant',
 *   getDetails: (c) => ({ name: c.req.valid('json').name }),
 * }))
 * ```
 */
export function auditLog(
  options: HonoAdapterOptions,
  config: {
    action: string
    resource: string
    actorType?: 'user' | 'system' | 'admin_api' | 'admin_impersonation'
    getDetails?: (c: Context) => Record<string, unknown>
  },
) {
  const apiKeyCtxKey = options.apiKeyContextKey ?? 'apiKey'
  const sessionCtxKey = options.sessionContextKey ?? 'portalSession'

  return async (c: Context, next: Next) => {
    const tenantId = c.get('tenantId') as string | undefined

    // No tenant context — skip silently
    if (!tenantId) {
      await next()
      return
    }

    const ip = resolveClientIp(c)
    const portalSession = c.get(sessionCtxKey) as PortalSessionInfo | undefined
    const apiKey = c.get(apiKeyCtxKey) as ApiKeyInfo | undefined
    const actorId = portalSession?.user_id ?? apiKey?.created_by ?? null

    // Fire-and-forget — don't block the response
    options.ts
      .logAuditEvent({
        tenant_id: tenantId,
        actor_id: actorId,
        actor_type: config.actorType ?? (portalSession ? 'user' : 'admin_api'),
        action: config.action,
        resource: config.resource,
        details: config.getDetails?.(c) ?? {},
        ip,
        user_agent: c.req.header('user-agent') ?? null,
      })
      .catch((err) => {
        options.ts.logger.error('Audit log write failed:', err)
      })

    await next()
  }
}

// Type imports for the file
import type { ApiKeyInfo, PortalSessionInfo } from '@tenantscale/sdk'
