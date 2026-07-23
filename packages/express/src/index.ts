// ──────────────────────────────────────────────────────
// @tenantscale/express — Barrel exports
// ──────────────────────────────────────────────────────

// Types & type augmentation
export type {
  ExpressAdapterOptions,
  MiddlewareFactory,
  AsyncMiddleware,
  ErrorResponse,
} from './types.js'
export type { ApiKeyInfo, PortalSessionInfo } from './types.js'

// Middleware
export {
  authenticateApiKey,
  requireScope,
  requirePortalSession,
  requirePortalRole,
  requireSuperAdmin,
  requirePlanLimit,
  rateLimitByApiKey,
  rateLimitByIp,
  auditLog,
} from './middleware.js'

// Error handlers
export { errorHandler, genericErrorHandler, createErrorHandlers } from './error-handler.js'
