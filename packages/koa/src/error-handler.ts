// ──────────────────────────────────────────────────────
// @tenantscale/koa — Error Handler
// ──────────────────────────────────────────────────────

import type { Context, Next } from 'koa'
import {
  TenantScaleError,
  PlanLimitExceededError,
  RateLimitExceededError,
} from '@tenantscale/sdk'
import type { KoaAdapterOptions, ErrorResponse } from './types.js'

export function errorHandler(_options?: KoaAdapterOptions) {
  return async (ctx: Context, next: Next) => {
    try {
      await next()
    } catch (err) {
      const error = err as Error & { statusCode?: number; code?: string }

      if (!(error instanceof TenantScaleError)) {
        const message = process.env.NODE_ENV === 'production'
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
