// ──────────────────────────────────────────────────────
// @tenantscale/hono — Error Handler
// ──────────────────────────────────────────────────────
//
// Hono-compatible error handler that catches TenantScaleError
// instances and returns structured JSON responses.
//
// Usage:
// ```ts
// import { errorHandler } from '@tenantscale/hono'
// app.onError(errorHandler({ ts }))
// ```

import type { Context } from 'hono'
import { TenantScaleError, PlanLimitExceededError, RateLimitExceededError } from '@tenantscale/sdk'
import type { HonoAdapterOptions, ErrorResponse } from './types.js'

/**
 * Hono error handler for TenantScale errors.
 *
 * Maps known error types to appropriate HTTP status codes and
 * returns a consistent JSON error response shape.
 *
 * Unknown errors are re-thrown so a downstream generic handler
 * can deal with them.
 *
 * Usage:
 * ```ts
 * import { errorHandler } from '@tenantscale/hono'
 * app.onError(errorHandler({ ts }))
 * ```
 */
export function errorHandler(options?: HonoAdapterOptions) {
  return (err: Error, c: Context): Response => {
    // Not a TenantScale error — re-throw for generic handler
    if (!(err instanceof TenantScaleError)) {
      const message =
        process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : err.message || 'Internal server error'
      return c.json(
        {
          error: message,
          code: 'INTERNAL_ERROR',
          statusCode: 500,
        },
        500,
      )
    }

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

    // Set Retry-After for rate limit errors
    const retryAfter = (err as any).retryAfter
    if (retryAfter && typeof retryAfter === 'number') {
      c.header('Retry-After', String(retryAfter))
    }

    return c.json(body, err.statusCode as 400 | 401 | 403 | 404 | 409 | 429 | 500)
  }
}
