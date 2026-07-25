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
