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
