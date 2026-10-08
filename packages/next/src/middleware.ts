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
// @tenantscale/next — Middleware
// ──────────────────────────────────────────────────────
//
// Thin Next.js wrappers around the shared middleware core.
// All business logic lives in @tenantscale/sdk/middleware-core.ts.
//
// Each function composes a handler and returns a new handler, so you
// can protect App Router Route Handlers fluently:
//
// ```ts
// export const GET = requirePlanLimit(
//   { ts },
//   'max_tenants',
//   () => countTenants(tenantId),
// )(withSession({ ts }, async (req, { session }) => {
//   return NextResponse.json({ email: session.email })
// }))
// ```
//
// Failures are converted to structured JSON responses via errorResponse,
// matching the rest of the @tenantscale/next adapter.

import {
  auditLogCore,
  rateLimitByApiKeyCore,
  rateLimitByIpCore,
  requirePlanLimitCore,
  requirePortalRoleCore,
  requireScopeCore,
  requireSuperAdminCore,
} from '@tenantscale/sdk'
import type { ApiKeyInfo, PortalSessionInfo } from '@tenantscale/sdk'
import { authenticateApiKey, requirePortalSession } from './authenticate.js'
import { errorResponse } from './error-handler.js'
import type { NextAdapterOptions, RouteParams } from './types.js'

// ── Signature of a Next.js Route Handler ──
// Matches the (request, { params }) pattern used by App Router.

export type AppRouterHandler = (
  request: Request,
  routeParams: RouteParams,
) => Response | Promise<Response>

/** A function that wraps an App Router handler with a middleware check. */
export type AppRouterMiddleware = (handler: AppRouterHandler) => AppRouterHandler

// ── Helper: resolve client IP ──

function resolveClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    request.headers.get('cf-connecting-ip') ??
    '127.0.0.1'
  )
}

// ──────────────────────────────────────────────────────
// Scope Enforcement
// ──────────────────────────────────────────────────────

/**
 * Requires the authenticated API key to hold at least one of the given scopes.
 *
 * Resolves the API key from the request headers and returns a 401/403 JSON
 * response if authentication fails or the required scope is missing.
 */
export function requireScope(
  options: NextAdapterOptions,
  ...scopes: string[]
): AppRouterMiddleware {
  return (handler) => {
    return async (request, routeParams) => {
      try {
        const { apiKey } = await authenticateApiKey(request, options)
        requireScopeCore(options.ts, apiKey, scopes)
        return handler(request, routeParams)
      } catch (err) {
        return errorResponse(err)
      }
    }
  }
}

// ──────────────────────────────────────────────────────
// Portal Role Enforcement
// ──────────────────────────────────────────────────────

/**
 * Requires the authenticated portal session to hold at least one of the given roles.
 *
 * Resolves the session from the Authorization header and returns a 401/403
 * JSON response if authentication fails or the required role is missing.
 */
export function requirePortalRole(
  options: NextAdapterOptions,
  ...roles: string[]
): AppRouterMiddleware {
  return (handler) => {
    return async (request, routeParams) => {
      try {
        const { session } = await requirePortalSession(request, options)
        requirePortalRoleCore(options.ts, session, roles)
        return handler(request, routeParams)
      } catch (err) {
        return errorResponse(err)
      }
    }
  }
}

// ──────────────────────────────────────────────────────
// Super Admin Enforcement
// ──────────────────────────────────────────────────────

/**
 * Requires the authenticated portal session to be a super admin.
 *
 * Resolves the session from the Authorization header and returns a 401/403
 * JSON response if authentication fails or the user is not a super admin.
 */
export function requireSuperAdmin(options: NextAdapterOptions): AppRouterMiddleware {
  return (handler) => {
    return async (request, routeParams) => {
      try {
        const { session } = await requirePortalSession(request, options)
        requireSuperAdminCore(options.ts, session)
        return handler(request, routeParams)
      } catch (err) {
        return errorResponse(err)
      }
    }
  }
}

// ──────────────────────────────────────────────────────
// Plan Enforcement
// ──────────────────────────────────────────────────────

/**
 * Checks the tenant's plan limit for a feature before running the handler.
 *
 * Resolves the tenant ID from the API key headers. `currentCount` may be a
 * static number or a function that reads the current usage from the request.
 */
export function requirePlanLimit(
  options: NextAdapterOptions,
  feature: string,
  currentCount: number | ((request: Request) => number | Promise<number>),
): AppRouterMiddleware {
  return (handler) => {
    return async (request, routeParams) => {
      try {
        const { tenantId } = await authenticateApiKey(request, options)
        await requirePlanLimitCore(
          options.ts,
          tenantId,
          feature,
          typeof currentCount === 'function' ? () => currentCount(request) : currentCount,
        )
        return handler(request, routeParams)
      } catch (err) {
        return errorResponse(err)
      }
    }
  }
}

// ──────────────────────────────────────────────────────
// Rate Limiting
// ──────────────────────────────────────────────────────

/**
 * Enforces the plan-based daily API rate limit for the authenticated API key.
 *
 * Adds `X-RateLimit-Limit-Daily` / `X-RateLimit-Remaining-Daily` headers to
 * the response and returns a 429 with `Retry-After` when the limit is hit.
 */
export function rateLimitByApiKey(options: NextAdapterOptions): AppRouterMiddleware {
  return (handler) => {
    return async (request, routeParams) => {
      try {
        const { apiKey } = await authenticateApiKey(request, options)
        const result = await rateLimitByApiKeyCore(options.ts, apiKey)
        const response = await handler(request, routeParams)
        response.headers.set('X-RateLimit-Limit-Daily', String(result.limit))
        response.headers.set('X-RateLimit-Remaining-Daily', String(result.remaining))
        return response
      } catch (err) {
        return errorResponse(err)
      }
    }
  }
}

/**
 * Enforces the IP-based creation rate limit.
 *
 * Returns a 429 with a `Retry-After` header when the IP is temporarily blocked.
 */
export function rateLimitByIp(options: NextAdapterOptions): AppRouterMiddleware {
  return (handler) => {
    return async (request, routeParams) => {
      try {
        await rateLimitByIpCore(options.ts, resolveClientIp(request))
        return handler(request, routeParams)
      } catch (err) {
        return errorResponse(err)
      }
    }
  }
}

// ──────────────────────────────────────────────────────
// Audit Logging
// ──────────────────────────────────────────────────────

/**
 * Logs an audit event for the current request (fire-and-forget).
 *
 * Resolves the authenticated context best-effort. If no tenant ID can be
 * resolved the audit entry is skipped, and audit failures never block the
 * request — matching the behavior of the other adapters.
 */
export function auditLog(
  options: NextAdapterOptions,
  config: {
    action: string
    resource: string
    actorType?: 'user' | 'system' | 'admin_api' | 'admin_impersonation'
    getDetails?: (request: Request) => Record<string, unknown>
  },
): AppRouterMiddleware {
  return (handler) => {
    return async (request, routeParams) => {
      let apiKey: ApiKeyInfo | undefined
      let session: PortalSessionInfo | undefined
      let tenantId: string | undefined

      try {
        const resolved = await authenticateApiKey(request, options)
        apiKey = resolved.apiKey
        tenantId = resolved.tenantId
      } catch {
        try {
          const resolved = await requirePortalSession(request, options)
          session = resolved.session
          tenantId = resolved.tenantId ?? undefined
        } catch {
          // No authenticated context — skip the audit entry.
        }
      }

      auditLogCore(
        options.ts,
        tenantId,
        { ...config, details: config.getDetails?.(request) },
        {
          ip: resolveClientIp(request),
          userAgent: request.headers.get('user-agent'),
          session,
          apiKey,
        },
      )

      return handler(request, routeParams)
    }
  }
}
