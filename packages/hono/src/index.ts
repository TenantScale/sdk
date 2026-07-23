// ──────────────────────────────────────────────────────
// @tenantscale/hono — Barrel exports
// ──────────────────────────────────────────────────────

// Types
export type { HonoAdapterOptions, ErrorResponse } from './types.js'
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

// Error handler
export { errorHandler } from './error-handler.js'
