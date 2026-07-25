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
// @tenantscale/sdk — Barrel exports
// ──────────────────────────────────────────────────────

// Main class
export { TenantScale } from './sdk.js'

// Core modules (for direct use)
export { PlanStore } from './plan.js'
export { RateLimiter } from './rate-limit.js'
export { WebhookDispatcher } from './webhook.js'
export { StripeClient } from './stripe.js'

// Auth
export { validateApiKey, requireScope, hasRequiredScope } from './auth.js'
export { validateApiKey as validateSessionApiKey } from './auth.js'

// API Key generation
export { generateApiKey, hashApiKey, isValidApiKeyFormat } from './api-key.js'

// Session
export { validateSession, requirePortalRole, requireSuperAdmin } from './session.js'

// Audit
export { logAuditEvent, getClientIp, createAuditEvent } from './audit.js'

// Pagination
export { parsePaginationParams, paginationResponse } from './pagination.js'

// SSRF
export { validateWebhookUrl } from './ssrf.js'

// Middleware core (framework-agnostic)
export {
  authenticateApiKeyCore,
  requireScopeCore,
  requirePortalSessionCore,
  requirePortalRoleCore,
  requireSuperAdminCore,
  requirePlanLimitCore,
  rateLimitByApiKeyCore,
  rateLimitByIpCore,
  auditLogCore,
} from './middleware-core.js'
export type { AuditLogConfig, RequestMeta } from './middleware-core.js'

// Types
export type {
  TenantScaleOptions,
  ApiKeyInfo,
  PortalSessionInfo,
  GeneratedApiKey,
  PlanInfo,
  PlanLimitError,
  PlanFeatureError,
  AuditEventInput,
  RateLimitResult,
  IpCreationLimitResult,
  PaginationParams,
  PaginationMeta,
  WebhookPayload,
  WebhookDeliveryResult,
  PlanPriceMapping,
  CreateCheckoutOptions,
  CreatePortalOptions,
  Logger,
} from './types.js'

// Error classes
export {
  TenantScaleError,
  AuthenticationError,
  AuthorizationError,
  PlanLimitExceededError,
  RateLimitExceededError,
  NotFoundError,
  ConflictError,
} from './types.js'

// DB type helpers
export type {
  DbTenant,
  DbAuditEvent,
  DbApiKey,
  DbWebhook,
  DbPlan,
  DbTenantUser,
  DbSubscription,
} from './types.js'
