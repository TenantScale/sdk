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
// @tenantscale/express — Middleware
// ──────────────────────────────────────────────────────
//
// Thin Express wrappers around the shared middleware core.
// All business logic lives in @tenantscale/sdk/middleware-core.ts.
// These wrappers handle Express-specific request/response types.

import type { Request, Response, NextFunction } from 'express'
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
import type { ExpressAdapterOptions } from './types.js'

// ── Helper: resolve client IP ──

function resolveClientIp(req: Request, options: ExpressAdapterOptions): string {
  if (options.ipHeader) {
    const customIp = req.headers[options.ipHeader.toLowerCase()]?.toString().trim()
    if (customIp) return customIp
  }
  return (
    req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ??
    req.headers['x-real-ip']?.toString().trim() ??
    req.ip ??
    '127.0.0.1'
  )
}

// ── Helper: resolve header (case-insensitive) ──

function getHeader(req: Request, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()]
  if (value === undefined) return undefined
  if (Array.isArray(value)) return value[0]
  return value
}

type AsyncMw = (req: Request, res: Response, next: NextFunction) => Promise<void>

// ──────────────────────────────────────────────────────
// API Key Authentication
// ──────────────────────────────────────────────────────

export function authenticateApiKey(options: ExpressAdapterOptions): AsyncMw {
  const headerName = options.apiKeyHeader ?? 'x-api-key'
  const audit = options.audit ?? true

  return async (req, _res, next) => {
    try {
      const result = await authenticateApiKeyCore(
        options.ts,
        getHeader(req, headerName),
        headerName,
        audit,
        {
          url: req.originalUrl ?? req.url,
          ip: resolveClientIp(req, options),
          userAgent: getHeader(req, 'user-agent'),
        },
      )
      req.tenantKey = result.apiKey
      req.tenantId = result.tenantId
      next()
    } catch (err) {
      next(err)
    }
  }
}

// ──────────────────────────────────────────────────────
// Scope Enforcement
// ──────────────────────────────────────────────────────

export function requireScope(options: ExpressAdapterOptions, ...scopes: string[]): AsyncMw {
  return async (req, _res, next) => {
    try {
      requireScopeCore(options.ts, req.tenantKey, scopes)
      next()
    } catch (err) {
      next(err)
    }
  }
}

// ──────────────────────────────────────────────────────
// Portal Session Authentication
// ──────────────────────────────────────────────────────

export function requirePortalSession(options: ExpressAdapterOptions): AsyncMw {
  const headerName = options.authHeader ?? 'authorization'

  return async (req, _res, next) => {
    try {
      const result = await requirePortalSessionCore(
        options.ts,
        getHeader(req, headerName),
        headerName,
      )
      req.portalSession = result.session
      if (result.tenantId) req.tenantId = result.tenantId
      next()
    } catch (err) {
      next(err)
    }
  }
}

// ──────────────────────────────────────────────────────
// Portal Role Enforcement
// ──────────────────────────────────────────────────────

export function requirePortalRole(options: ExpressAdapterOptions, ...roles: string[]): AsyncMw {
  return async (req, _res, next) => {
    try {
      requirePortalRoleCore(options.ts, req.portalSession, roles)
      next()
    } catch (err) {
      next(err)
    }
  }
}

// ──────────────────────────────────────────────────────
// Super Admin Enforcement
// ──────────────────────────────────────────────────────

export function requireSuperAdmin(options: ExpressAdapterOptions): AsyncMw {
  return async (req, _res, next) => {
    try {
      requireSuperAdminCore(options.ts, req.portalSession)
      next()
    } catch (err) {
      next(err)
    }
  }
}

// ──────────────────────────────────────────────────────
// Plan Enforcement
// ──────────────────────────────────────────────────────

export function requirePlanLimit(
  options: ExpressAdapterOptions,
  feature: string,
  currentCount: number | ((req: Request) => number | Promise<number>),
): AsyncMw {
  return async (req, _res, next) => {
    try {
      await requirePlanLimitCore(
        options.ts,
        req.tenantId,
        feature,
        typeof currentCount === 'function' ? () => currentCount(req) : currentCount,
      )
      next()
    } catch (err) {
      next(err)
    }
  }
}

// ──────────────────────────────────────────────────────
// Rate Limiting
// ──────────────────────────────────────────────────────

export function rateLimitByApiKey(options: ExpressAdapterOptions): AsyncMw {
  return async (req, _res, next) => {
    try {
      await rateLimitByApiKeyCore(options.ts, req.tenantKey)
      next()
    } catch (err) {
      next(err)
    }
  }
}

export function rateLimitByIp(options: ExpressAdapterOptions): AsyncMw {
  return async (req, _res, next) => {
    try {
      await rateLimitByIpCore(options.ts, resolveClientIp(req, options))
      next()
    } catch (err) {
      next(err)
    }
  }
}

// ──────────────────────────────────────────────────────
// Audit Logging
// ──────────────────────────────────────────────────────

export function auditLog(
  options: ExpressAdapterOptions,
  config: {
    action: string
    resource: string
    actorType?: 'user' | 'system' | 'admin_api' | 'admin_impersonation'
    getDetails?: (req: Request) => Record<string, unknown>
  },
): AsyncMw {
  return async (req, _res, next) => {
    auditLogCore(
      options.ts,
      req.tenantId,
      { ...config, details: config.getDetails?.(req) },
      {
        ip: resolveClientIp(req, options),
        userAgent: getHeader(req, 'user-agent'),
        session: req.portalSession,
        apiKey: req.tenantKey,
      },
    )
    next()
  }
}
