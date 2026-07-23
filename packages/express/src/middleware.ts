// ──────────────────────────────────────────────────────
// @tenantscale/express — Middleware
// ──────────────────────────────────────────────────────
//
// All middleware functions are factory wrappers that
// consume an ExpressAdapterOptions (which provides the
// TenantScale SDK instance) and return Express middleware.

import type { Request, Response, NextFunction } from 'express'
import type { ApiKeyInfo, PortalSessionInfo } from '@tenantscale/sdk'
import {
  AuthenticationError,
  RateLimitExceededError,
  PlanLimitExceededError,
} from '@tenantscale/sdk'
import type { ExpressAdapterOptions } from './types.js'

// ── Helper: resolve client IP ──

function resolveClientIp(req: Request, options: ExpressAdapterOptions): string {
  return (
    req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ??
    req.headers['x-real-ip']?.toString().trim() ??
    req.ip ??
    '127.0.0.1'
  )
}

// ── Helper: resolve header name (case-insensitive) ──

function getHeader(req: Request, name: string): string | undefined {
  // Express lowercases all headers
  return req.headers[name.toLowerCase()] as string | undefined
}

// ──────────────────────────────────────────────────────
// API Key Authentication
// ──────────────────────────────────────────────────────

/**
 * Middleware that authenticates a request using an API key.
 *
 * Reads the API key from `x-api-key` header (configurable via
 * `apiKeyHeader` option), validates it against the database, and
 * attaches the resolved `ApiKeyInfo` to `req.tenantKey`.
 *
 * On failure, responds with 401 and does NOT call next().
 *
 * Usage:
 * ```ts
 * app.use('/api', authenticateApiKey({ ts }))
 * ```
 */
export function authenticateApiKey(options: ExpressAdapterOptions): AsyncMiddleware {
  const headerName = options.apiKeyHeader ?? 'x-api-key'
  const audit = options.audit ?? true

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = getHeader(req, headerName)

      if (!token) {
        throw new AuthenticationError(`Missing ${headerName} header`)
      }

      const apiKey = await options.ts.validateApiKey(token)
      req.tenantKey = apiKey
      req.tenantId = apiKey.tenant_id

      // Automatic audit logging on successful auth
      if (audit) {
        options.ts
          .logAuditEvent({
            tenant_id: apiKey.tenant_id,
            actor_id: apiKey.key_record_id,
            actor_type: 'admin_api',
            action: 'api_key.authenticated',
            resource: req.originalUrl ?? req.url,
            ip: resolveClientIp(req, options),
            user_agent: req.headers['user-agent'] ?? undefined,
          })
          .catch(() => {
            /* fire-and-forget */
          })
      }

      next()
    } catch (err) {
      next(err)
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
 * app.delete('/api/keys/:id', authenticateApiKey({ ts }), requireScope({ ts }, 'admin'))
 * ```
 */
export function requireScope(options: ExpressAdapterOptions, ...scopes: string[]): AsyncMiddleware {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.tenantKey) {
        throw new AuthenticationError('Authentication required')
      }
      options.ts.requireScope(req.tenantKey, ...scopes)
      next()
    } catch (err) {
      next(err)
    }
  }
}

// ──────────────────────────────────────────────────────
// Portal Session Authentication
// ──────────────────────────────────────────────────────

/**
 * Middleware that authenticates a request using a portal session JWT.
 *
 * Reads `Authorization: Bearer <token>` header (configurable via
 * `authHeader` option), validates the session, and attaches the
 * resolved `PortalSessionInfo` to `req.portalSession`.
 *
 * On failure, responds with 401 and does NOT call next().
 *
 * Usage:
 * ```ts
 * app.use('/portal', requirePortalSession({ ts }))
 * ```
 */
export function requirePortalSession(options: ExpressAdapterOptions): AsyncMiddleware {
  const headerName = options.authHeader ?? 'authorization'

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = getHeader(req, headerName)

      if (!authHeader) {
        throw new AuthenticationError(`Missing ${headerName} header`)
      }

      const parts = authHeader.split(' ')
      if (parts.length !== 2 || parts[0] !== 'Bearer') {
        throw new AuthenticationError(
          'Invalid authorization header format. Expected: Bearer <token>',
        )
      }

      const session = await options.ts.validateSession(parts[1])
      req.portalSession = session
      if (session.tenant_id) {
        req.tenantId = session.tenant_id
      }
      next()
    } catch (err) {
      next(err)
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
 * app.get('/portal/admin', requirePortalSession({ ts }), requirePortalRole({ ts }, 'admin'))
 * ```
 */
export function requirePortalRole(
  options: ExpressAdapterOptions,
  ...roles: string[]
): AsyncMiddleware {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.portalSession) {
        throw new AuthenticationError('Portal session required')
      }
      options.ts.requirePortalRole(req.portalSession, ...roles)
      next()
    } catch (err) {
      next(err)
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
 * app.get('/admin/tenants', requirePortalSession({ ts }), requireSuperAdmin({ ts }))
 * ```
 */
export function requireSuperAdmin(options: ExpressAdapterOptions): AsyncMiddleware {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.portalSession) {
        throw new AuthenticationError('Portal session required')
      }
      options.ts.requireSuperAdmin(req.portalSession)
      next()
    } catch (err) {
      next(err)
    }
  }
}

// ──────────────────────────────────────────────────────
// Plan Enforcement
// ──────────────────────────────────────────────────────

/**
 * Middleware factory that checks the tenant's plan limit for a given
 * feature (e.g. "max_tenants", "max_users", "max_api_keys").
 *
 * Requires a tenant ID to be resolved on the request (via
 * `authenticateApiKey` or `requirePortalSession` first).
 *
 * The `currentCount` is either a static number or a synchronous
 * function that takes the request and returns the current usage count.
 *
 * Usage:
 * ```ts
 * // Static limit check
 * app.post('/api/tenants', authenticateApiKey({ ts }), requirePlanLimit({ ts }, 'max_tenants', 5))
 *
 * // Dynamic limit check
 * app.post('/api/users', authenticateApiKey({ ts }), requirePlanLimit({ ts }, 'max_users', async (req) => {
 *   const { count } = await db.query('SELECT count(*) FROM tenant_users WHERE tenant_id = $1', [req.tenantId])
 *   return count
 * }))
 * ```
 */
export function requirePlanLimit(
  options: ExpressAdapterOptions,
  feature: string,
  currentCount: number | ((req: Request) => number | Promise<number>),
): AsyncMiddleware {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.tenantId
      if (!tenantId) {
        throw new AuthenticationError(
          'Tenant ID not resolved. Ensure authenticateApiKey or requirePortalSession runs first.',
        )
      }

      const limit = await options.ts.plans.getPlanLimit(tenantId, feature)

      // null limit = unlimited
      if (limit === null) {
        next()
        return
      }

      const current = typeof currentCount === 'function' ? await currentCount(req) : currentCount

      if (current >= limit) {
        throw new PlanLimitExceededError(limit, current, feature)
      }

      next()
    } catch (err) {
      next(err)
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
 * On limit exceeded, responds with 429 and sets Retry-After header.
 *
 * Usage:
 * ```ts
 * app.use('/api', authenticateApiKey({ ts }), rateLimitByApiKey({ ts }))
 * ```
 */
export function rateLimitByApiKey(options: ExpressAdapterOptions): AsyncMiddleware {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.tenantKey) {
        throw new AuthenticationError('Authentication required for rate limiting')
      }

      const result = await options.ts.rateLimiter.checkDailyLimit(req.tenantKey)

      if (!result.allowed) {
        throw new RateLimitExceededError(result.limit)
      }

      next()
    } catch (err) {
      next(err)
    }
  }
}

/**
 * Middleware that checks IP-based creation rate limiting.
 *
 * Useful for signup endpoints and public-facing mutation routes
 * where API key auth isn't used.
 *
 * Usage:
 * ```ts
 * app.post('/signup', rateLimitByIp({ ts }))
 * ```
 */
export function rateLimitByIp(options: ExpressAdapterOptions): AsyncMiddleware {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const ip = resolveClientIp(req, options)
      const result = await options.ts.rateLimiter.checkIpCreationLimit(ip)

      if (result.blocked) {
        const retryAfter = Math.ceil((result.resetAtMs - Date.now()) / 1000)
        const err = new RateLimitExceededError(
          result.remaining,
          `IP rate limit exceeded. Try again in ${retryAfter}s.`,
        )
        ;(err as any).retryAfter = Math.max(1, retryAfter)
        throw err
      }

      next()
    } catch (err) {
      next(err)
    }
  }
}

// ──────────────────────────────────────────────────────
// Audit Logging
// ──────────────────────────────────────────────────────

/**
 * Middleware factory that logs an audit event for the current request.
 *
 * Requires `req.tenantId` to be resolved (via auth middleware first).
 *
 * Usage:
 * ```ts
 * app.post('/api/tenants', authenticateApiKey({ ts }), auditLog({ ts }, {
 *   action: 'tenant.create',
 *   resource: 'tenant',
 *   getDetails: (req) => ({ name: req.body.name }),
 *   actorType: 'admin_api',
 * }))
 * ```
 */
export function auditLog(
  options: ExpressAdapterOptions,
  config: {
    action: string
    resource: string
    actorType?: 'user' | 'system' | 'admin_api' | 'admin_impersonation'
    getDetails?: (req: Request) => Record<string, unknown>
  },
): AsyncMiddleware {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.tenantId
      if (!tenantId) {
        // No tenant context — skip silently rather than throw
        next()
        return
      }

      const ip = resolveClientIp(req, options)
      const actorId = req.portalSession?.user_id ?? req.tenantKey?.created_by ?? null

      await options.ts.logAuditEvent({
        tenant_id: tenantId,
        actor_id: actorId,
        actor_type: config.actorType ?? (req.portalSession ? 'user' : 'admin_api'),
        action: config.action,
        resource: config.resource,
        details: config.getDetails?.(req) ?? {},
        ip,
        user_agent: req.headers['user-agent']?.toString() ?? null,
      })

      next()
    } catch (err) {
      // Audit failures should not break the request — log and continue
      options.ts.logger.error('Audit log write failed:', err)
      next()
    }
  }
}

// ── Type helper for async middleware ──

type AsyncMiddleware = (req: Request, res: Response, next: NextFunction) => Promise<void>
