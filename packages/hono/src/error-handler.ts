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
export function errorHandler(_options?: HonoAdapterOptions) {
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
