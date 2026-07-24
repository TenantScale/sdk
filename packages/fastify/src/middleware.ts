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
// @tenantscale/fastify — Middleware
// ──────────────────────────────────────────────────────
//
// Thin Fastify wrappers around the shared middleware core.
// All business logic lives in @tenantscale/sdk/middleware-core.ts.

import type { FastifyReply, FastifyRequest } from 'fastify'
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
import type { FastifyAdapterOptions } from './types.js'

// ── Helper: resolve client IP ──

type Req = FastifyRequest

function resolveClientIp(req: Req): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim() ?? '127.0.0.1'
  if (Array.isArray(forwarded)) return forwarded[0]?.trim() ?? '127.0.0.1'
  return req.headers['x-real-ip']?.toString() ?? '127.0.0.1'
}

function getHeader(req: Req, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value?.toString()
}

// ── Cast helpers (Fastify doesn't augment request) ──

function tk(req: Req) {
  return (req as unknown as { tenantKey?: any }).tenantKey
}
function tid(req: Req) {
  return (req as unknown as { tenantId?: string }).tenantId
}
function ps(req: Req) {
  return (req as unknown as { portalSession?: any }).portalSession
}
function setTk(req: Req, v: any) {
  ;(req as unknown as Record<string, any>).tenantKey = v
}
function setTid(req: Req, v: string | undefined) {
  ;(req as unknown as Record<string, any>).tenantId = v
}
function setPs(req: Req, v: any) {
  ;(req as unknown as Record<string, any>).portalSession = v
}

// ── Error helper ──

function sendError(reply: FastifyReply, err: unknown, defaultStatus: number) {
  const e = err as Error & { statusCode?: number; code?: string; retryAfter?: number }
  const statusCode = e.statusCode ?? defaultStatus
  if (e.retryAfter) {
    reply.header('Retry-After', String(e.retryAfter))
  }
  reply.code(statusCode).send({
    error: e.message ?? 'Request failed',
    code: e.code ?? 'ERROR',
    statusCode: e.statusCode ?? defaultStatus,
  })
}

// ──────────────────────────────────────────────────────

export function authenticateApiKey(options: FastifyAdapterOptions) {
  const headerName = options.apiKeyHeader ?? 'x-api-key'
  const audit = options.audit ?? true

  return async (req: Req, reply: FastifyReply) => {
    try {
      const result = await authenticateApiKeyCore(
        options.ts,
        getHeader(req, headerName),
        headerName,
        audit,
        {
          url: req.url,
          ip: resolveClientIp(req),
          userAgent: req.headers['user-agent']?.toString(),
        },
      )
      setTk(req, result.apiKey)
      setTid(req, result.tenantId)
    } catch (err) {
      sendError(reply, err, 401)
    }
  }
}

export function requireScope(options: FastifyAdapterOptions, ...scopes: string[]) {
  return async (req: Req, reply: FastifyReply) => {
    try {
      requireScopeCore(options.ts, tk(req), scopes)
    } catch (err) {
      sendError(reply, err, 403)
    }
  }
}

export function requirePortalSession(options: FastifyAdapterOptions) {
  const headerName = options.authHeader ?? 'authorization'

  return async (req: Req, reply: FastifyReply) => {
    try {
      const result = await requirePortalSessionCore(
        options.ts,
        getHeader(req, headerName),
        headerName,
      )
      setPs(req, result.session)
      if (result.tenantId) setTid(req, result.tenantId)
    } catch (err) {
      sendError(reply, err, 401)
    }
  }
}

export function requirePortalRole(options: FastifyAdapterOptions, ...roles: string[]) {
  return async (req: Req, reply: FastifyReply) => {
    try {
      requirePortalRoleCore(options.ts, ps(req), roles)
    } catch (err) {
      sendError(reply, err, 403)
    }
  }
}

export function requireSuperAdmin(options: FastifyAdapterOptions) {
  return async (req: Req, reply: FastifyReply) => {
    try {
      requireSuperAdminCore(options.ts, ps(req))
    } catch (err) {
      sendError(reply, err, 403)
    }
  }
}

export function requirePlanLimit(
  options: FastifyAdapterOptions,
  feature: string,
  currentCount: number | ((req: Req) => number | Promise<number>),
) {
  return async (req: Req, reply: FastifyReply) => {
    try {
      await requirePlanLimitCore(
        options.ts,
        tid(req),
        feature,
        typeof currentCount === 'function' ? () => currentCount(req) : currentCount,
      )
    } catch (err) {
      sendError(reply, err, 403)
    }
  }
}

export function rateLimitByApiKey(options: FastifyAdapterOptions) {
  return async (req: Req, reply: FastifyReply) => {
    try {
      await rateLimitByApiKeyCore(options.ts, tk(req))
    } catch (err) {
      sendError(reply, err, 429)
    }
  }
}

export function rateLimitByIp(options: FastifyAdapterOptions) {
  return async (req: Req, reply: FastifyReply) => {
    try {
      await rateLimitByIpCore(options.ts, resolveClientIp(req))
    } catch (err) {
      sendError(reply, err, 429)
    }
  }
}

export function auditLog(
  options: FastifyAdapterOptions,
  config: {
    action: string
    resource: string
    actorType?: 'user' | 'system' | 'admin_api' | 'admin_impersonation'
    getDetails?: (req: Req) => Record<string, unknown>
  },
) {
  return async (req: Req, _reply: FastifyReply) => {
    auditLogCore(
      options.ts,
      tid(req),
      { ...config, details: config.getDetails?.(req) },
      {
        ip: resolveClientIp(req),
        userAgent: req.headers['user-agent']?.toString(),
        session: ps(req),
        apiKey: tk(req),
      },
    )
  }
}
