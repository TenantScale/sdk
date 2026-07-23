// ──────────────────────────────────────────────────────
// @tenantscale/next — Error Response Helpers
// ──────────────────────────────────────────────────────
//
// Converts TenantScaleError instances into standard Response
// objects for use in Next.js Route Handlers.

import { TenantScaleError, PlanLimitExceededError, RateLimitExceededError } from '@tenantscale/sdk'
import type { ErrorResponse } from './types.js'

/**
 * Converts a caught error into a JSON Response object.
 *
 * - TenantScaleError subclasses → appropriate status code + structured body
 * - Unknown errors → 500 Internal Server Error
 *
 * Usage:
 * ```ts
 * try {
 *   const apiKey = await authenticateApiKey(req, { ts })
 *   return NextResponse.json({ ... })
 * } catch (err) {
 *   return errorResponse(err)
 * }
 * ```
 */
export function errorResponse(err: unknown): Response {
  if (err instanceof TenantScaleError) {
    const body: ErrorResponse = {
      error: err.message,
      code: err.code,
      statusCode: err.statusCode,
    }

    if (err instanceof PlanLimitExceededError) {
      body.details = { limit: err.limit, current: err.current }
    }

    if (err instanceof RateLimitExceededError) {
      body.details = { planLimit: err.planLimit }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    // Set Retry-After for rate limit errors
    const retryAfter = (err as any).retryAfter
    if (retryAfter) {
      headers['Retry-After'] = String(retryAfter)
    }

    return new Response(JSON.stringify(body), {
      status: err.statusCode,
      headers,
    })
  }

  // Unknown error — log sanitized details, never leak stack traces
  const message =
    process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : 'Internal error (check server logs)'

  if (err instanceof Error) {
    console.error('[TenantScale] Unhandled error:', err.message)
  } else {
    console.error('[TenantScale] Unhandled error:', err)
  }

  return new Response(
    JSON.stringify({
      error: message,
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    } satisfies ErrorResponse),
    {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    },
  )
}
