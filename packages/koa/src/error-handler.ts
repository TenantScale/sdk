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
// @tenantscale/koa — Error Handler
// ──────────────────────────────────────────────────────

import type { Context, Next } from 'koa'
import { TenantScaleError, PlanLimitExceededError, RateLimitExceededError } from '@tenantscale/sdk'
import type { KoaAdapterOptions, ErrorResponse } from './types.js'

export function errorHandler(_options?: KoaAdapterOptions) {
  return async (ctx: Context, next: Next) => {
    try {
      await next()
    } catch (err) {
      const error = err as Error & { statusCode?: number; code?: string }

      if (!(error instanceof TenantScaleError)) {
        const message =
          process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : error.message || 'Internal server error'
        ctx.status = 500
        ctx.body = {
          error: message,
          code: 'INTERNAL_ERROR',
          statusCode: 500,
        }
        return
      }

      const body: ErrorResponse = {
        error: error.message,
        code: error.code,
        statusCode: error.statusCode,
      }

      if (error instanceof PlanLimitExceededError) {
        body.details = { limit: error.limit, current: error.current }
      }

      if (error instanceof RateLimitExceededError) {
        body.details = { planLimit: error.planLimit }
      }

      const retryAfter = (error as Error & { retryAfter?: number }).retryAfter
      if (retryAfter) {
        ctx.set('Retry-After', String(retryAfter))
      }

      ctx.status = error.statusCode
      ctx.body = body
    }
  }
}
