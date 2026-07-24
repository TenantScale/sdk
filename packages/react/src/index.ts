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
// @tenantscale/react — Barrel exports
// ──────────────────────────────────────────────────────

// Provider & Context
export { TenantProvider, useTenantScale, useClient } from './context.js'
export type { TenantProviderProps } from './context.js'

// Client
export { TenantScaleClient } from './client.js'
export type { TenantScaleReactOptions } from './types.js'

// Hooks
export { useTenant } from './hooks/useTenant.js'
export type { TenantContext } from './hooks/useTenant.js'

export { usePlan } from './hooks/usePlan.js'
export { useApiKeys } from './hooks/useApiKeys.js'
export { useTeam } from './hooks/useTeam.js'
export { useAuditLog } from './hooks/useAuditLog.js'
export type { AuditLogResult } from './hooks/useAuditLog.js'
export { useWebhooks } from './hooks/useWebhooks.js'

// SSR
export { getTenantSsr, getTenantSsrFromHeaders } from './ssr.js'

// Types
export type {
  UserProfile,
  TenantInfo,
  PlanInfo,
  DeploymentInfo,
  MeResponse,
  ApiKey,
  CreatedApiKey,
  TeamMember,
  AuditEvent,
  Webhook,
  WebhookDelivery,
  PaginationMeta,
  PaginatedResponse,
  UseQueryResult,
  UseMutationResult,
  TenantSsrContext,
} from './types.js'
