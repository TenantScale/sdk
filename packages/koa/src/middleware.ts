// ──────────────────────────────────────────────────────
// @tenantscale/koa — Middleware
// ──────────────────────────────────────────────────────

import type { Context, Next } from 'koa'
import {
  AuthenticationError,
  PlanLimitExceededError,
  RateLimitExceededError,
} from '@tenantscale/sdk'
import type { KoaAdapterOptions } from './types.js'

function resolveClientIp(ctx: Context): string {
  const forwarded = ctx.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() ?? '127.0.0.1'
  }

  return ctx.get('x-real-ip').trim() || '127.0.0.1'
}

function getHeader(ctx: Context, name: string): string | undefined {
  return ctx.get(name)
}

export function authenticateApiKey(options: KoaAdapterOptions) {
  const headerName = options.apiKeyHeader ?? 'x-api-key'
  const audit = options.audit ?? true

  return async (ctx: Context, next: Next) => {
    try {
      const token = getHeader(ctx, headerName)
      if (!token) {
        throw new AuthenticationError(`Missing ${headerName} header`)
      }

      const apiKey = await options.ts.validateApiKey(token)
      ;(ctx as Context & { tenantKey?: any }).tenantKey = apiKey
      ;(ctx as Context & { tenantId?: string }).tenantId = apiKey.tenant_id

      if (audit) {
        options.ts.logAuditEvent({
          tenant_id: apiKey.tenant_id,
          actor_id: apiKey.key_record_id,
          actor_type: 'admin_api',
          action: 'api_key.authenticated',
          resource: ctx.path,
          ip: resolveClientIp(ctx),
          user_agent: ctx.get('user-agent') ?? undefined,
        }).catch(() => {})
      }

      await next()
    } catch (err) {
      const error = err as Error & { statusCode?: number; code?: string }
      ctx.status = error.statusCode ?? 401
      ctx.body = {
        error: error.message ?? 'Authentication failed',
        code: error.code ?? 'AUTH_FAILED',
        statusCode: error.statusCode ?? 401,
      }
    }
  }
}

export function requireScope(options: KoaAdapterOptions, ...scopes: string[]) {
  return async (ctx: Context, next: Next) => {
    try {
      const tenantKey = (ctx as Context & { tenantKey?: any }).tenantKey
      if (!tenantKey) {
        throw new AuthenticationError('Authentication required')
      }
      options.ts.requireScope(tenantKey, ...scopes)
      await next()
    } catch (err) {
      const error = err as Error & { statusCode?: number; code?: string }
      ctx.status = error.statusCode ?? 403
      ctx.body = {
        error: error.message ?? 'Authorization failed',
        code: error.code ?? 'MISSING_SCOPE',
        statusCode: error.statusCode ?? 403,
      }
    }
  }
}

export function requirePortalSession(options: KoaAdapterOptions) {
  const headerName = options.authHeader ?? 'authorization'

  return async (ctx: Context, next: Next) => {
    try {
      const authHeader = getHeader(ctx, headerName)
      if (!authHeader) {
        throw new AuthenticationError(`Missing ${headerName} header`)
      }

      const parts = authHeader.split(' ')
      if (parts.length !== 2 || parts[0] !== 'Bearer') {
        throw new AuthenticationError('Invalid authorization header format. Expected: Bearer <token>')
      }

      const session = await options.ts.validateSession(parts[1])
      ;(ctx as Context & { portalSession?: any }).portalSession = session
      if (session.tenant_id) {
        ;(ctx as Context & { tenantId?: string }).tenantId = session.tenant_id
      }
      await next()
    } catch (err) {
      const error = err as Error & { statusCode?: number; code?: string }
      ctx.status = error.statusCode ?? 401
      ctx.body = {
        error: error.message ?? 'Session validation failed',
        code: error.code ?? 'SESSION_INVALID',
        statusCode: error.statusCode ?? 401,
      }
    }
  }
}

export function requirePortalRole(options: KoaAdapterOptions, ...roles: string[]) {
  return async (ctx: Context, next: Next) => {
    try {
      const portalSession = (ctx as Context & { portalSession?: any }).portalSession
      if (!portalSession) {
        throw new AuthenticationError('Portal session required')
      }
      options.ts.requirePortalRole(portalSession, ...roles)
      await next()
    } catch (err) {
      const error = err as Error & { statusCode?: number; code?: string }
      ctx.status = error.statusCode ?? 403
      ctx.body = {
        error: error.message ?? 'Authorization failed',
        code: error.code ?? 'MISSING_ROLE',
        statusCode: error.statusCode ?? 403,
      }
    }
  }
}

export function requireSuperAdmin(options: KoaAdapterOptions) {
  return async (ctx: Context, next: Next) => {
    try {
      const portalSession = (ctx as Context & { portalSession?: any }).portalSession
      if (!portalSession) {
        throw new AuthenticationError('Portal session required')
      }
      options.ts.requireSuperAdmin(portalSession)
      await next()
    } catch (err) {
      const error = err as Error & { statusCode?: number; code?: string }
      ctx.status = error.statusCode ?? 403
      ctx.body = {
        error: error.message ?? 'Super admin access required',
        code: error.code ?? 'NOT_SUPER_ADMIN',
        statusCode: error.statusCode ?? 403,
      }
    }
  }
}

export function requirePlanLimit(
  options: KoaAdapterOptions,
  feature: string,
  currentCount: number | ((ctx: Context) => number | Promise<number>),
) {
  return async (ctx: Context, next: Next) => {
    try {
      const tenantId = (ctx as Context & { tenantId?: string }).tenantId
      if (!tenantId) {
        throw new AuthenticationError('Tenant ID not resolved. Ensure authenticateApiKey or requirePortalSession runs first.')
      }

      const limit = await options.ts.plans.getPlanLimit(tenantId, feature)
      if (limit === null) {
        await next()
        return
      }

      const current = typeof currentCount === 'function' ? await currentCount(ctx) : currentCount
      if (current >= limit) {
        throw new PlanLimitExceededError(limit, current, feature)
      }

      await next()
    } catch (err) {
      const error = err as Error & { statusCode?: number; code?: string }
      ctx.status = error.statusCode ?? 403
      ctx.body = {
        error: error.message ?? 'Plan limit check failed',
        code: error.code ?? 'PLAN_LIMIT_REACHED',
        statusCode: error.statusCode ?? 403,
      }
    }
  }
}

export function rateLimitByApiKey(options: KoaAdapterOptions) {
  return async (ctx: Context, next: Next) => {
    try {
      const tenantKey = (ctx as Context & { tenantKey?: any }).tenantKey
      if (!tenantKey) {
        throw new AuthenticationError('Authentication required for rate limiting')
      }

      const result = await options.ts.rateLimiter.checkDailyLimit(tenantKey)
      if (!result.allowed) {
        throw new RateLimitExceededError(result.limit)
      }

      await next()
    } catch (err) {
      const error = err as Error & { statusCode?: number; code?: string }
      ctx.status = error.statusCode ?? 429
      ctx.body = {
        error: error.message ?? 'Rate limit exceeded',
        code: error.code ?? 'DAILY_LIMIT_EXCEEDED',
        statusCode: error.statusCode ?? 429,
      }
    }
  }
}

export function rateLimitByIp(options: KoaAdapterOptions) {
  return async (ctx: Context, next: Next) => {
    try {
      const result = await options.ts.rateLimiter.checkIpCreationLimit(resolveClientIp(ctx))
      if (result.blocked) {
        const retryAfter = Math.ceil((result.resetAtMs - Date.now()) / 1000)
        ctx.set('Retry-After', String(Math.max(1, retryAfter)))
        ctx.status = 429
        ctx.body = {
          error: `IP rate limit exceeded. Try again in ${Math.max(1, retryAfter)}s.`,
          code: 'IP_RATE_LIMITED',
          statusCode: 429,
        }
        return
      }

      await next()
    } catch (err) {
      const error = err as Error & { statusCode?: number; code?: string }
      ctx.status = error.statusCode ?? 429
      ctx.body = {
        error: error.message ?? 'Rate limit check failed',
        code: error.code ?? 'RATE_LIMIT_ERROR',
        statusCode: error.statusCode ?? 429,
      }
    }
  }
}

export function auditLog(
  options: KoaAdapterOptions,
  config: {
    action: string
    resource: string
    actorType?: 'user' | 'system' | 'admin_api' | 'admin_impersonation'
    getDetails?: (ctx: Context) => Record<string, unknown>
  },
) {
  return async (ctx: Context, next: Next) => {
    const tenantId = (ctx as Context & { tenantId?: string }).tenantId
    if (!tenantId) {
      await next()
      return
    }

    const portalSession = (ctx as Context & { portalSession?: any }).portalSession
    const tenantKey = (ctx as Context & { tenantKey?: any }).tenantKey
    const actorId = portalSession?.user_id ?? tenantKey?.created_by ?? null

    options.ts.logAuditEvent({
      tenant_id: tenantId,
      actor_id: actorId,
      actor_type: config.actorType ?? (portalSession ? 'user' : 'admin_api'),
      action: config.action,
      resource: config.resource,
      details: config.getDetails?.(ctx),
      ip: resolveClientIp(ctx),
      user_agent: ctx.get('user-agent') ?? undefined,
    }).catch(err => {
      options.ts.logger?.error?.('Audit log write failed:', err)
    })

    await next()
  }
}
