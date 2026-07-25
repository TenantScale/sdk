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
// @tenantscale/react — Shared Types
// ──────────────────────────────────────────────────────

// ── API Response Shapes ──

export interface UserProfile {
  id: string
  email: string
}

export interface TenantInfo {
  id: string
  name: string
  slug: string
  role: string
  is_super_admin: boolean
}

export interface PlanInfo {
  id: string
  name: string
  price_monthly: number
  features: Record<string, unknown>
  limits: Record<string, number | null>
}

export interface DeploymentInfo {
  mode: 'self_hosted' | 'cloud'
}

export interface MeResponse {
  user: UserProfile
  tenant: TenantInfo
  plan: PlanInfo
  deployment: DeploymentInfo
}

export interface ApiKey {
  id: string
  label: string
  key_prefix: string
  scopes: string[]
  is_active: boolean
  expires_at: string | null
  last_used_at: string | null
  created_at: string
}

export interface CreatedApiKey extends ApiKey {
  raw_key: string
}

export interface TeamMember {
  id: string
  user_id: string
  email: string
  role: string
  joined_at: string
}

export interface AuditEvent {
  id: string
  actor_id: string | null
  actor_type: string
  action: string
  resource: string
  details: Record<string, unknown> | null
  ip: string | null
  created_at: string
}

export interface Webhook {
  id: string
  url: string
  events: string[]
  description: string
  is_active: boolean
  created_at: string
}

export interface WebhookDelivery {
  id: string
  event_type: string
  url: string
  status: string
  response_status: number | null
  error_message: string | null
  duration_ms: number
  created_at: string
}

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  total_pages: number
}

export interface PaginatedResponse<T> {
  data: T[]
  meta: PaginationMeta
}

// ── Hook Return Types ──

export interface UseQueryResult<T> {
  data: T | null
  error: Error | null
  isLoading: boolean
  refetch: () => Promise<void>
}

export interface UseMutationResult<TInput, TOutput> {
  execute: (input: TInput) => Promise<TOutput>
  isLoading: boolean
  error: Error | null
}

// ── Client Types ──

export interface TenantScaleReactOptions {
  /** Base URL for the TenantScale API (or BFF proxy) */
  baseUrl: string
  /** Optional custom fetch implementation (for BFF proxy patterns) */
  fetch?: typeof globalThis.fetch
  /** Function that returns an access token for auth headers */
  getAccessToken?: () => string | null
}

// ── SSH Types ──

export interface TenantSsrContext {
  user: UserProfile
  tenant: TenantInfo
  plan: PlanInfo
  deployment: DeploymentInfo
}
