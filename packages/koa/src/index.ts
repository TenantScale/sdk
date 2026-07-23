// ──────────────────────────────────────────────────────
// @tenantscale/koa — Barrel exports
// ──────────────────────────────────────────────────────

export type { KoaAdapterOptions, ErrorResponse } from './types.js'
export type { ApiKeyInfo, PortalSessionInfo } from './types.js'

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

export { errorHandler } from './error-handler.js'
