/*
 * MIT License
 *
 * Copyright (c) 2026 TenantScale
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

// ──────────────────────────────────────────────────────
// @tenantscale/hono — Middleware
// ──────────────────────────────────────────────────────
//
// Thin Hono wrappers around the shared middleware core.
// All business logic lives in @tenantscale/sdk/middleware-core.ts.

import type { Context, Next } from 'hono'
import {
  authenticateApiKeyCore,
  requireScopeCore,
  requirePortalSessionCore,
  requirePortalRoleCore,
  requireSuperAdminCore,
  requirePlanLimitCore,
  rateLimitByApiKeyCore,
  rateLimitByIpCore,
  auditLogCore,
} from '@tenantscale/sdk'
import type { ApiKeyInfo, PortalSessionInfo } from '@tenantscale/sdk'
import type { HonoAdapterOptions } from './types.js'

// ── Helper: resolve client IP ──

function resolveClientIp(c: Context): string {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    c.req.header('x-real-ip') ??
    '127.0.0.1'
  )
}

function getHeader(c: Context, name: string): string | undefined {
  return c.req.header(name)
}

// ── Context key constants (match defaults in types.ts) ──

const API_KEY_CTX = 'apiKey'
const SESSION_CTX = 'portalSession'
const TENANT_ID_CTX = 'tenantId'

// ──────────────────────────────────────────────────────
// API Key Authentication
// ──────────────────────────────────────────────────────

export function authenticateApiKey(options: HonoAdapterOptions) {
  const headerName = options.apiKeyHeader ?? 'x-api-key'
  const ctxKey = options.apiKeyContextKey ?? API_KEY_CTX
  const audit = options.audit ?? true

  return async (c: Context, next: Next) => {
    const token = getHeader(c, headerName)

    if (!token) {
      return c.json({ error: `Missing API key in ${headerName} header`, code: 'AUTH_FAILED' }, 401)
    }

    try {
      const result = await authenticateApiKeyCore(options.ts, token, headerName, audit, {
        url: c.req.path,
        ip: resolveClientIp(c),
        userAgent: c.req.header('user-agent'),
      })
      c.set(ctxKey, result.apiKey)
      c.set(TENANT_ID_CTX, result.tenantId)
      await next()
    } catch (err) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return c.json(
        { error: e.message ?? 'Invalid API key', code: e.code ?? 'AUTH_FAILED' },
        (e.statusCode ?? 401) as 401,
      )
    }
  }
}

// ──────────────────────────────────────────────────────
// Scope Enforcement
// ──────────────────────────────────────────────────────

export function requireScope(options: HonoAdapterOptions, ...scopes: string[]) {
  const ctxKey = options.apiKeyContextKey ?? API_KEY_CTX

  return async (c: Context, next: Next) => {
    try {
      requireScopeCore(options.ts, c.get(ctxKey) as ApiKeyInfo | undefined, scopes)
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

export function requirePortalSession(options: HonoAdapterOptions) {
  const headerName = options.sessionHeader ?? 'Authorization'
  const ctxKey = options.sessionContextKey ?? SESSION_CTX

  return async (c: Context, next: Next) => {
    try {
      const result = await requirePortalSessionCore(
        options.ts,
        getHeader(c, headerName),
        headerName,
      )
      c.set(ctxKey, result.session)
      if (result.tenantId) c.set(TENANT_ID_CTX, result.tenantId)
      await next()
    } catch (err) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return c.json(
        { error: e.message ?? 'Invalid session', code: e.code ?? 'SESSION_INVALID' },
        (e.statusCode ?? 401) as 401,
      )
    }
  }
}

// ──────────────────────────────────────────────────────
// Portal Role Enforcement
// ──────────────────────────────────────────────────────

export function requirePortalRole(options: HonoAdapterOptions, ...roles: string[]) {
  const ctxKey = options.sessionContextKey ?? SESSION_CTX

  return async (c: Context, next: Next) => {
    try {
      requirePortalRoleCore(options.ts, c.get(ctxKey) as PortalSessionInfo | undefined, roles)
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

// ──────────────────────────────────────────────────────
// Super Admin Enforcement
// ──────────────────────────────────────────────────────

export function requireSuperAdmin(options: HonoAdapterOptions) {
  const ctxKey = options.sessionContextKey ?? SESSION_CTX

  return async (c: Context, next: Next) => {
    try {
      requireSuperAdminCore(options.ts, c.get(ctxKey) as PortalSessionInfo | undefined)
      await next()
    } catch {
      return c.json({ error: 'Super admin access required', code: 'NOT_SUPER_ADMIN' }, 403)
    }
  }
}

// ──────────────────────────────────────────────────────
// Plan Enforcement
// ──────────────────────────────────────────────────────

export function requirePlanLimit(
  options: HonoAdapterOptions,
  feature: string,
  currentCount: number | ((c: Context) => number | Promise<number>),
) {
  return async (c: Context, next: Next) => {
    try {
      await requirePlanLimitCore(
        options.ts,
        c.get(TENANT_ID_CTX) as string | undefined,
        feature,
        typeof currentCount === 'function' ? () => currentCount(c) : currentCount,
      )
      await next()
    } catch (err) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return c.json(
        { error: e.message ?? 'Plan check failed', code: e.code ?? 'PLAN_ERROR' },
        (e.statusCode ?? 500) as 400 | 403 | 500,
      )
    }
  }
}

// ──────────────────────────────────────────────────────
// Rate Limiting
// ──────────────────────────────────────────────────────

export function rateLimitByApiKey(options: HonoAdapterOptions) {
  const ctxKey = options.apiKeyContextKey ?? API_KEY_CTX

  return async (c: Context, next: Next) => {
    try {
      const result = await rateLimitByApiKeyCore(
        options.ts,
        c.get(ctxKey) as ApiKeyInfo | undefined,
      )
      c.header('X-RateLimit-Limit-Daily', result.limit.toString())
      c.header('X-RateLimit-Remaining-Daily', String(result.remaining))
      await next()
    } catch (err) {
      const e = err as {
        statusCode?: number
        message?: string
        code?: string
        planLimit?: number
      }
      c.header('X-RateLimit-Limit-Daily', String(e.planLimit ?? ''))
      c.header('X-RateLimit-Remaining-Daily', '0')
      return c.json(
        { error: e.message ?? 'Rate limit check failed', code: e.code ?? 'RATE_LIMIT_ERROR' },
        (e.statusCode ?? 500) as 400 | 429 | 500,
      )
    }
  }
}

export function rateLimitByIp(options: HonoAdapterOptions) {
  return async (c: Context, next: Next) => {
    try {
      await rateLimitByIpCore(options.ts, resolveClientIp(c))
      await next()
    } catch (err) {
      const e = err as { statusCode?: number; message?: string; code?: string; retryAfter?: number }
      if (e.retryAfter) {
        c.header('Retry-After', String(e.retryAfter))
      }
      return c.json(
        { error: e.message ?? 'Rate limit check failed', code: e.code ?? 'RATE_LIMIT_ERROR' },
        (e.statusCode ?? 429) as 429,
      )
    }
  }
}

// ──────────────────────────────────────────────────────
// Audit Logging
// ──────────────────────────────────────────────────────

export function auditLog(
  options: HonoAdapterOptions,
  config: {
    action: string
    resource: string
    actorType?: 'user' | 'system' | 'admin_api' | 'admin_impersonation'
    getDetails?: (c: Context) => Record<string, unknown>
  },
) {
  const apiKeyCtxKey = options.apiKeyContextKey ?? API_KEY_CTX
  const sessionCtxKey = options.sessionContextKey ?? SESSION_CTX

  return async (c: Context, next: Next) => {
    auditLogCore(
      options.ts,
      c.get(TENANT_ID_CTX) as string | undefined,
      { ...config, details: config.getDetails?.(c) },
      {
        ip: resolveClientIp(c),
        userAgent: c.req.header('user-agent'),
        session: c.get(sessionCtxKey) as PortalSessionInfo | undefined,
        apiKey: c.get(apiKeyCtxKey) as ApiKeyInfo | undefined,
      },
    )
    await next()
  }
}
