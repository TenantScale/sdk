// ──────────────────────────────────────────────────────
// @tenantscale/next — Route Handler Wrappers
// ──────────────────────────────────────────────────────
//
// Declarative wrappers for Next.js App Router Route Handlers.
//
// These handle auth, plan checks, and error conversion so your
// handlers only deal with resolved context and success cases.
//
// Usage:
// ```ts
// const h = createHandler({ ts })
//
// export const GET = h.withApiKey(async (req, { apiKey, tenantId }) => {
//   return NextResponse.json({ tenantId, scopes: apiKey.scopes })
// })
//
// export const POST = h.withSession(async (req, { session }) => {
//   return NextResponse.json({ email: session.email })
// })
// ```

import type { NextAdapterOptions, ApiKeyContext, SessionContext, RouteParams } from './types.js'
import { authenticateApiKey, requirePortalSession } from './authenticate.js'
import { errorResponse } from './error-handler.js'

// ── Signature of a Next.js Route Handler ──
// Matches the (request, { params }) pattern used by App Router.

type NextRouteHandler = (request: Request, routeParams: RouteParams) => Response | Promise<Response>

// ── User-provided handler that receives auth context ──

type ApiKeyHandler = (
  request: Request,
  context: ApiKeyContext,
  routeParams: RouteParams,
) => Response | Promise<Response>

type SessionHandler = (
  request: Request,
  context: SessionContext,
  routeParams: RouteParams,
) => Response | Promise<Response>

// ── createHandler Factory ──

export interface HandlerFactory {
  /**
   * Wraps a route handler with API key authentication.
   *
   * Validates the x-api-key header, provides `apiKey` and `tenantId`
   * to the handler, and catches errors into structured JSON responses.
   *
   * ```ts
   * export const GET = h.withApiKey(async (req, { apiKey, tenantId }) => {
   *   return NextResponse.json({ tenantId })
   * })
   * ```
   */
  withApiKey: (handler: ApiKeyHandler) => NextRouteHandler

  /**
   * Wraps a route handler with portal session authentication.
   *
   * Validates `Authorization: Bearer <jwt>`, provides `session` and
   * `tenantId` to the handler, and catches errors.
   *
   * ```ts
   * export const GET = h.withSession(async (req, { session, tenantId }) => {
   *   return NextResponse.json({ email: session.email })
   * })
   * ```
   */
  withSession: (handler: SessionHandler) => NextRouteHandler
}

/**
 * Creates a Next.js Route Handler factory bound to a TenantScale instance.
 *
 * Usage:
 * ```ts
 * import { createHandler } from '@tenantscale/next'
 * const h = createHandler({ ts })
 *
 * export const GET = h.withApiKey(async (req, { apiKey, tenantId }) => {
 *   return NextResponse.json({ tenants: await getTenants(tenantId) })
 * })
 * ```
 */
export function createHandler(options: NextAdapterOptions): HandlerFactory {
  const audit = options.audit ?? true

  function getClientIp(request: Request): string | undefined {
    return (
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      request.headers.get('cf-connecting-ip') ??
      undefined
    )
  }

  return {
    withApiKey(handler: ApiKeyHandler): NextRouteHandler {
      return async (request, routeParams) => {
        try {
          const { apiKey, tenantId } = await authenticateApiKey(request, options)

          // Automatic audit logging on successful auth
          if (audit) {
            options.ts
              .logAuditEvent({
                tenant_id: tenantId,
                actor_id: apiKey.key_record_id,
                actor_type: 'admin_api',
                action: 'api_key.authenticated',
                resource: request.url,
                ip: getClientIp(request),
                user_agent: request.headers.get('user-agent') ?? undefined,
              })
              .catch(() => {
                /* fire-and-forget */
              })
          }

          return await handler(request, { apiKey, tenantId }, routeParams)
        } catch (err) {
          return errorResponse(err)
        }
      }
    },

    withSession(handler: SessionHandler): NextRouteHandler {
      return async (request, routeParams) => {
        try {
          const { session, tenantId } = await requirePortalSession(request, options)
          return await handler(request, { session, tenantId }, routeParams)
        } catch (err) {
          return errorResponse(err)
        }
      }
    },
  }
}

// ── Standalone wrapper utilities ──

/**
 * Wraps a handler with API key authentication.
 *
 * Convenience wrapper when you don't need the full factory.
 *
 * Usage:
 * ```ts
 * import { withApiKey } from '@tenantscale/next'
 *
 * export const GET = withApiKey({ ts }, async (req, { apiKey }) => {
 *   return NextResponse.json({ scopes: apiKey.scopes })
 * })
 * ```
 */
export function withApiKey(options: NextAdapterOptions, handler: ApiKeyHandler): NextRouteHandler {
  return createHandler(options).withApiKey(handler)
}

/**
 * Wraps a handler with portal session authentication.
 *
 * Usage:
 * ```ts
 * import { withSession } from '@tenantscale/next'
 *
 * export const GET = withSession({ ts }, async (req, { session }) => {
 *   return NextResponse.json({ email: session.email })
 * })
 * ```
 */
export function withSession(
  options: NextAdapterOptions,
  handler: SessionHandler,
): NextRouteHandler {
  return createHandler(options).withSession(handler)
}
