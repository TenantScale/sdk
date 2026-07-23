// ──────────────────────────────────────────────────────
// @tenantscale/next — Barrel exports
// ──────────────────────────────────────────────────────

// Types
export type {
  NextAdapterOptions,
  ApiKeyContext,
  SessionContext,
  RouteHandlerConfig,
  PlanLimitConfig,
  RouteParams,
  ErrorResponse,
} from './types.js'
export type { ApiKeyInfo, PortalSessionInfo } from './types.js'

// Auth functions
export { authenticateApiKey, requirePortalSession } from './authenticate.js'

// Route handler wrappers
export { createHandler, withApiKey, withSession } from './handler.js'

// Error handling
export { errorResponse } from './error-handler.js'

// App Router helpers
export { createAppRouterHandler } from './app-router.js'
