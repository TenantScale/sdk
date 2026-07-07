// ──────────────────────────────────────────────────────
// @tenantscale/express — Error Handler Middleware
// ──────────────────────────────────────────────────────
//
// Converts TenantScaleError subclasses into structured JSON
// HTTP responses with appropriate status codes.
//
// Usage:
// ```ts
// import { errorHandler } from '@tenantscale/express'
// app.use(errorHandler)
// ```

import type { Request, Response, NextFunction } from 'express'
import {
  TenantScaleError,
  PlanLimitExceededError,
  RateLimitExceededError,
} from '@tenantscale/sdk'
import type { ExpressAdapterOptions, ErrorResponse } from './types.js'

/**
 * Express error-handling middleware for TenantScale errors.
 *
 * Maps known error types to appropriate HTTP status codes and
 * returns a consistent JSON error response shape.
 *
 * Unknown errors are re-thrown to be handled by a downstream
 * generic error handler (or the framework's default).
 *
 * Usage:
 * ```ts
 * import { errorHandler } from '@tenantscale/express'
 * app.use(errorHandler)
 * ```
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Not a TenantScale error — pass through
  if (!(err instanceof TenantScaleError)) {
    next(err)
    return
  }

  // Build consistent error response
  const body: ErrorResponse = {
    error: err.message,
    code: err.code,
    statusCode: err.statusCode,
  }

  // Attach extra details for specific error types
  if (err instanceof PlanLimitExceededError) {
    body.details = {
      limit: err.limit,
      current: err.current,
    }
  }

  if (err instanceof RateLimitExceededError) {
    body.details = {
      planLimit: err.planLimit,
    }
  }

  // Set Retry-After for rate limit errors
  const retryAfter = (err as any).retryAfter
  if (retryAfter) {
    res.set('Retry-After', String(retryAfter))
  }

  res.status(err.statusCode)
  res.json(body)
}

/**
 * Generic catch-all error handler for Express apps using TenantScale.
 *
 * Logs the error and returns a 500 response. Should be the LAST
 * middleware added to the Express app.
 *
 * Usage:
 * ```ts
 * app.use(errorHandler)
 * app.use(genericErrorHandler)
 * ```
 */
export function genericErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Don't leak internal error details in production
  const message =
    process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message || 'Internal server error'

  res.status(500)
  res.json({
    error: message,
    code: 'INTERNAL_ERROR',
    statusCode: 500,
  })
}

// ── Adapter-level error handler (convenience) ──

/**
 * Creates a complete error handler pair scoped to an adapter instance.
 * Returns [tenantScaleErrorHandler, genericErrorHandler] ready to
 * be mounted on an Express app.
 *
 * Usage:
 * ```ts
 * const [onError, onFatal] = createErrorHandlers({ ts })
 * app.use('/api', router)
 * app.use(onError)
 * app.use(onFatal)
 * ```
 */
export function createErrorHandlers(_options?: ExpressAdapterOptions) {
  return [errorHandler, genericErrorHandler] as const
}
