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
// @tenantscale/fastify — Error Handler
// ──────────────────────────────────────────────────────

import type { FastifyReply, FastifyRequest } from 'fastify'
import { TenantScaleError, PlanLimitExceededError, RateLimitExceededError } from '@tenantscale/sdk'
import type { FastifyAdapterOptions, ErrorResponse } from './types.js'

export function errorHandler(_options?: FastifyAdapterOptions) {
  return (err: Error, _req: FastifyRequest, reply: FastifyReply) => {
    if (!(err instanceof TenantScaleError)) {
      const message =
        process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : err.message || 'Internal server error'
      reply.code(500).send({
        error: message,
        code: 'INTERNAL_ERROR',
        statusCode: 500,
      })
      return
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

    const retryAfter = (err as Error & { retryAfter?: number }).retryAfter
    if (retryAfter) {
      reply.header('Retry-After', String(retryAfter))
    }

    reply.code(err.statusCode).send(body)
  }
}
