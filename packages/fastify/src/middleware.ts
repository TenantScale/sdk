// ──────────────────────────────────────────────────────
// @tenantscale/fastify — Middleware
// ──────────────────────────────────────────────────────

import type { FastifyReply, FastifyRequest } from 'fastify'
import {
  AuthenticationError,
  PlanLimitExceededError,
  RateLimitExceededError,
} from '@tenantscale/sdk'
import type { FastifyAdapterOptions } from './types.js'

function resolveClientIp(req: FastifyRequest): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim() ?? '127.0.0.1'
  }

  if (Array.isArray(forwarded)) {
    return forwarded[0]?.trim() ?? '127.0.0.1'
  }

  return req.headers['x-real-ip']?.toString() ?? '127.0.0.1'
}

function getHeader(req: FastifyRequest, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value?.toString()
}

export function authenticateApiKey(options: FastifyAdapterOptions) {
  const headerName = options.apiKeyHeader ?? 'x-api-key'
  const audit = options.audit ?? true

  return async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = getHeader(req, headerName)
      if (!token) {
        throw new AuthenticationError(`Missing ${headerName} header`)
      }

      const apiKey = await options.ts.validateApiKey(token)
      ;(req as FastifyRequest & { tenantKey?: any }).tenantKey = apiKey
      ;(req as FastifyRequest & { tenantId?: string }).tenantId = apiKey.tenant_id

      if (audit) {
        options.ts
          .logAuditEvent({
            tenant_id: apiKey.tenant_id,
            actor_id: apiKey.key_record_id,
            actor_type: 'admin_api',
            action: 'api_key.authenticated',
            resource: req.url,
            ip: resolveClientIp(req),
            user_agent: req.headers['user-agent']?.toString() ?? undefined,
          })
          .catch(() => {})
      }
    } catch (err) {
      const error = err as Error & { statusCode?: number; code?: string }
      reply.code(error.statusCode ?? 401).send({
        error: error.message ?? 'Authentication failed',
        code: error.code ?? 'AUTH_FAILED',
        statusCode: error.statusCode ?? 401,
      })
    }
  }
}

export function requireScope(options: FastifyAdapterOptions, ...scopes: string[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantKey = (req as FastifyRequest & { tenantKey?: any }).tenantKey
      if (!tenantKey) {
        throw new AuthenticationError('Authentication required')
      }
      options.ts.requireScope(tenantKey, ...scopes)
    } catch (err) {
      const error = err as Error & { statusCode?: number; code?: string }
      reply.code(error.statusCode ?? 403).send({
        error: error.message ?? 'Authorization failed',
        code: error.code ?? 'MISSING_SCOPE',
        statusCode: error.statusCode ?? 403,
      })
    }
  }
}

export function requirePortalSession(options: FastifyAdapterOptions) {
  const headerName = options.authHeader ?? 'authorization'

  return async (req: FastifyRequest, reply: FastifyReply) => {
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
      ;(req as FastifyRequest & { portalSession?: any }).portalSession = session
      if (session.tenant_id) {
        ;(req as FastifyRequest & { tenantId?: string }).tenantId = session.tenant_id
      }
    } catch (err) {
      const error = err as Error & { statusCode?: number; code?: string }
      reply.code(error.statusCode ?? 401).send({
        error: error.message ?? 'Session validation failed',
        code: error.code ?? 'SESSION_INVALID',
        statusCode: error.statusCode ?? 401,
      })
    }
  }
}

export function requirePortalRole(options: FastifyAdapterOptions, ...roles: string[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const portalSession = (req as FastifyRequest & { portalSession?: any }).portalSession
      if (!portalSession) {
        throw new AuthenticationError('Portal session required')
      }
      options.ts.requirePortalRole(portalSession, ...roles)
    } catch (err) {
      const error = err as Error & { statusCode?: number; code?: string }
      reply.code(error.statusCode ?? 403).send({
        error: error.message ?? 'Authorization failed',
        code: error.code ?? 'MISSING_ROLE',
        statusCode: error.statusCode ?? 403,
      })
    }
  }
}

export function requireSuperAdmin(options: FastifyAdapterOptions) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const portalSession = (req as FastifyRequest & { portalSession?: any }).portalSession
      if (!portalSession) {
        throw new AuthenticationError('Portal session required')
      }
      options.ts.requireSuperAdmin(portalSession)
    } catch (err) {
      const error = err as Error & { statusCode?: number; code?: string }
      reply.code(error.statusCode ?? 403).send({
        error: error.message ?? 'Super admin access required',
        code: error.code ?? 'NOT_SUPER_ADMIN',
        statusCode: error.statusCode ?? 403,
      })
    }
  }
}

export function requirePlanLimit(
  options: FastifyAdapterOptions,
  feature: string,
  currentCount: number | ((req: FastifyRequest) => number | Promise<number>),
) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = (req as FastifyRequest & { tenantId?: string }).tenantId
      if (!tenantId) {
        throw new AuthenticationError(
          'Tenant ID not resolved. Ensure authenticateApiKey or requirePortalSession runs first.',
        )
      }

      const limit = await options.ts.plans.getPlanLimit(tenantId, feature)
      if (limit === null) {
        return
      }

      const current = typeof currentCount === 'function' ? await currentCount(req) : currentCount
      if (current >= limit) {
        throw new PlanLimitExceededError(limit, current, feature)
      }
    } catch (err) {
      const error = err as Error & { statusCode?: number; code?: string }
      reply.code(error.statusCode ?? 403).send({
        error: error.message ?? 'Plan limit check failed',
        code: error.code ?? 'PLAN_LIMIT_REACHED',
        statusCode: error.statusCode ?? 403,
      })
    }
  }
}

export function rateLimitByApiKey(options: FastifyAdapterOptions) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantKey = (req as FastifyRequest & { tenantKey?: any }).tenantKey
      if (!tenantKey) {
        throw new AuthenticationError('Authentication required for rate limiting')
      }

      const result = await options.ts.rateLimiter.checkDailyLimit(tenantKey)
      if (!result.allowed) {
        throw new RateLimitExceededError(result.limit)
      }
    } catch (err) {
      const error = err as Error & { statusCode?: number; code?: string }
      reply.code(error.statusCode ?? 429).send({
        error: error.message ?? 'Rate limit exceeded',
        code: error.code ?? 'DAILY_LIMIT_EXCEEDED',
        statusCode: error.statusCode ?? 429,
      })
    }
  }
}

export function rateLimitByIp(options: FastifyAdapterOptions) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await options.ts.rateLimiter.checkIpCreationLimit(resolveClientIp(req))
      if (result.blocked) {
        const retryAfter = Math.ceil((result.resetAtMs - Date.now()) / 1000)
        reply.header('Retry-After', String(Math.max(1, retryAfter)))
        reply.code(429).send({
          error: `IP rate limit exceeded. Try again in ${Math.max(1, retryAfter)}s.`,
          code: 'IP_RATE_LIMITED',
          statusCode: 429,
        })
        return
      }
    } catch (err) {
      const error = err as Error & { statusCode?: number; code?: string }
      reply.code(error.statusCode ?? 429).send({
        error: error.message ?? 'Rate limit check failed',
        code: error.code ?? 'RATE_LIMIT_ERROR',
        statusCode: error.statusCode ?? 429,
      })
    }
  }
}

export function auditLog(
  options: FastifyAdapterOptions,
  config: {
    action: string
    resource: string
    actorType?: 'user' | 'system' | 'admin_api' | 'admin_impersonation'
    getDetails?: (req: FastifyRequest) => Record<string, unknown>
  },
) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    const tenantId = (req as FastifyRequest & { tenantId?: string }).tenantId
    if (!tenantId) {
      return
    }

    const portalSession = (req as FastifyRequest & { portalSession?: any }).portalSession
    const tenantKey = (req as FastifyRequest & { tenantKey?: any }).tenantKey
    const actorId = portalSession?.user_id ?? tenantKey?.created_by ?? null

    options.ts
      .logAuditEvent({
        tenant_id: tenantId,
        actor_id: actorId,
        actor_type: config.actorType ?? (portalSession ? 'user' : 'admin_api'),
        action: config.action,
        resource: config.resource,
        details: config.getDetails?.(req) ?? {},
        ip: resolveClientIp(req),
        user_agent: req.headers['user-agent']?.toString() ?? null,
      })
      .catch((err) => {
        options.ts.logger?.error?.('Audit log write failed:', err)
      })
  }
}
