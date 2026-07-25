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
// @tenantscale/koa — Middleware
// ──────────────────────────────────────────────────────
//
// Thin Koa wrappers around the shared middleware core.
// All business logic lives in @tenantscale/sdk/middleware-core.ts.

import type { Context, Next } from 'koa'
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
import type { KoaAdapterOptions } from './types.js'

// ── Helpers ──

function resolveClientIp(ctx: Context): string {
  const forwarded = ctx.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? '127.0.0.1'
  return ctx.get('x-real-ip').trim() || '127.0.0.1'
}

function getHeader(ctx: Context, name: string): string | undefined {
  return ctx.get(name)
}

// ── Cast helpers (Koa doesn't augment context) ──

function tk(ctx: Context) {
  return (ctx as unknown as { tenantKey?: any }).tenantKey
}
function tid(ctx: Context) {
  return (ctx as unknown as { tenantId?: string }).tenantId
}
function ps(ctx: Context) {
  return (ctx as unknown as { portalSession?: any }).portalSession
}
function setTk(ctx: Context, v: any) {
  ;(ctx as unknown as Record<string, any>).tenantKey = v
}
function setTid(ctx: Context, v: string | undefined) {
  ;(ctx as unknown as Record<string, any>).tenantId = v
}
function setPs(ctx: Context, v: any) {
  ;(ctx as unknown as Record<string, any>).portalSession = v
}

// ── Error helper ──

function sendError(ctx: Context, err: unknown, defaultStatus: number) {
  const e = err as Error & { statusCode?: number; code?: string; retryAfter?: number }
  ctx.status = e.statusCode ?? defaultStatus
  if (e.retryAfter) {
    ctx.set('Retry-After', String(e.retryAfter))
  }
  ctx.body = {
    error: e.message ?? 'Request failed',
    code: e.code ?? 'ERROR',
    statusCode: e.statusCode ?? defaultStatus,
  }
}

// ──────────────────────────────────────────────────────

export function authenticateApiKey(options: KoaAdapterOptions) {
  const headerName = options.apiKeyHeader ?? 'x-api-key'
  const audit = options.audit ?? true

  return async (ctx: Context, next: Next) => {
    try {
      const result = await authenticateApiKeyCore(
        options.ts,
        getHeader(ctx, headerName),
        headerName,
        audit,
        {
          url: ctx.path,
          ip: resolveClientIp(ctx),
          userAgent: ctx.get('user-agent'),
        },
      )
      setTk(ctx, result.apiKey)
      setTid(ctx, result.tenantId)
      await next()
    } catch (err) {
      sendError(ctx, err, 401)
    }
  }
}

export function requireScope(options: KoaAdapterOptions, ...scopes: string[]) {
  return async (ctx: Context, next: Next) => {
    try {
      requireScopeCore(options.ts, tk(ctx), scopes)
      await next()
    } catch (err) {
      sendError(ctx, err, 403)
    }
  }
}

export function requirePortalSession(options: KoaAdapterOptions) {
  const headerName = options.authHeader ?? 'authorization'

  return async (ctx: Context, next: Next) => {
    try {
      const result = await requirePortalSessionCore(
        options.ts,
        getHeader(ctx, headerName),
        headerName,
      )
      setPs(ctx, result.session)
      if (result.tenantId) setTid(ctx, result.tenantId)
      await next()
    } catch (err) {
      sendError(ctx, err, 401)
    }
  }
}

export function requirePortalRole(options: KoaAdapterOptions, ...roles: string[]) {
  return async (ctx: Context, next: Next) => {
    try {
      requirePortalRoleCore(options.ts, ps(ctx), roles)
      await next()
    } catch (err) {
      sendError(ctx, err, 403)
    }
  }
}

export function requireSuperAdmin(options: KoaAdapterOptions) {
  return async (ctx: Context, next: Next) => {
    try {
      requireSuperAdminCore(options.ts, ps(ctx))
      await next()
    } catch (err) {
      sendError(ctx, err, 403)
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
      await requirePlanLimitCore(
        options.ts,
        tid(ctx),
        feature,
        typeof currentCount === 'function' ? () => currentCount(ctx) : currentCount,
      )
      await next()
    } catch (err) {
      sendError(ctx, err, 403)
    }
  }
}

export function rateLimitByApiKey(options: KoaAdapterOptions) {
  return async (ctx: Context, next: Next) => {
    try {
      await rateLimitByApiKeyCore(options.ts, tk(ctx))
      await next()
    } catch (err) {
      sendError(ctx, err, 429)
    }
  }
}

export function rateLimitByIp(options: KoaAdapterOptions) {
  return async (ctx: Context, next: Next) => {
    try {
      await rateLimitByIpCore(options.ts, resolveClientIp(ctx))
      await next()
    } catch (err) {
      sendError(ctx, err, 429)
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
    auditLogCore(
      options.ts,
      tid(ctx),
      { ...config, details: config.getDetails?.(ctx) },
      {
        ip: resolveClientIp(ctx),
        userAgent: ctx.get('user-agent'),
        session: ps(ctx),
        apiKey: tk(ctx),
      },
    )
    await next()
  }
}
