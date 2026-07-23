// ──────────────────────────────────────────────────────
// TenantScale SDK — Shared Types
// ──────────────────────────────────────────────────────
// All types used across the SDK and adapter packages.
// Framework-agnostic — no imports from Express, Hono, Next.js, etc.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── TenantScale Options ──

export interface TenantScaleOptions {
  /** Pre-configured Supabase client. If omitted, supabaseUrl and supabaseKey are required. */
  supabase?: SupabaseClient
  /** Supabase project URL. Required if supabase client is not provided. */
  supabaseUrl?: string
  /** Supabase service_role key. Required if supabase client is not provided. */
  supabaseKey?: string
  /** Stripe secret key (optional — only needed for billing features). */
  stripeSecretKey?: string
  /** Stripe API version (default: '2026-06-24.dahlia'). */
  stripeApiVersion?: string
  /** Custom logger. Defaults to console. */
  logger?: Pick<Console, 'info' | 'warn' | 'error'>
  /** Deployment mode label (e.g. 'self_hosted', 'cloud'). */
  deploymentMode?: string
}

// ── Authentication Types ──

export interface ApiKeyInfo {
  raw: string
  tenant_id: string
  scopes: string[]
  created_by: string | null
  key_record_id: string
}

export interface PortalSessionInfo {
  user_id: string
  email: string
  tenant_id: string | null
  tenant_slug: string | null
  tenant_name: string | null
  role: string | null
  membership_id: string | null
  is_super_admin: boolean
}

export interface GeneratedApiKey {
  rawKey: string
  keyHash: string
  keyPrefix: string
}

// ── Plan Types ──

export interface PlanInfo {
  id: string
  name: string
  price_monthly: number
  max_users: number | null
  max_tenants: number | null
  max_api_keys: number | null
  api_calls_per_day: number | null
  audit_retention_days: number | null
  features: Record<string, boolean | number | string | null>
  _raw_features: Record<string, unknown>
}

export interface PlanLimitError {
  error: string
  code: 'PLAN_LIMIT_REACHED'
  limit: number | null
  current: number
}

export interface PlanFeatureError {
  error: string
  code: 'PLAN_FEATURE_DISABLED'
  feature: string
}

// ── Audit Types ──

export interface AuditEventInput {
  tenant_id: string
  actor_id?: string | null
  actor_type: 'user' | 'system' | 'admin_api' | 'admin_impersonation'
  action: string
  resource: string
  details?: Record<string, unknown>
  ip?: string | null
  user_agent?: string | null
}

// ── Rate Limit Types ──

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  limit: number
  current: number
}

export interface IpCreationLimitResult {
  blocked: boolean
  remaining: number
  resetAtMs: number
}

// ── Pagination Types ──

export interface PaginationParams {
  page: number
  limit: number
  offset: number
}

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  total_pages: number
}

// ── Webhook Types ──

export interface WebhookPayload {
  event: string
  tenant_id: string
  created_at: string
  data: Record<string, unknown>
}

export interface WebhookDeliveryResult {
  webhook_id: string
  status: 'delivered' | 'failed'
  response_status: number | null
  duration_ms: number
  error_message: string | null
}

// ── Stripe Types ──

export interface PlanPriceMapping {
  monthly: string | undefined
  yearly: string | undefined
}

export interface CreateCheckoutOptions {
  tenantId: string
  customerEmail?: string
  tenantName?: string
  priceId: string
  billingInterval: 'month' | 'year'
  successUrl: string
  cancelUrl: string
  metadata?: Record<string, string>
}

export interface CreatePortalOptions {
  tenantId: string
  returnUrl: string
}

// ── SDK Error Types ──

export class TenantScaleError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
  ) {
    super(message)
    this.name = 'TenantScaleError'
  }
}

export class AuthenticationError extends TenantScaleError {
  constructor(message: string, code = 'AUTH_FAILED') {
    super(message, code, 401)
    this.name = 'AuthenticationError'
  }
}

export class AuthorizationError extends TenantScaleError {
  constructor(message: string, code = 'FORBIDDEN') {
    super(message, code, 403)
    this.name = 'AuthorizationError'
  }
}

export class PlanLimitExceededError extends TenantScaleError {
  constructor(
    public readonly limit: number | null,
    public readonly current: number,
    field: string,
  ) {
    super(
      `Plan limit reached: ${field}. Upgrade your plan to increase this limit.`,
      'PLAN_LIMIT_REACHED',
      403,
    )
    this.name = 'PlanLimitExceededError'
  }
}

export class RateLimitExceededError extends TenantScaleError {
  constructor(
    public readonly planLimit: number,
    message?: string,
  ) {
    super(
      message ?? `Daily API call limit reached (${planLimit}). Upgrade your plan for more.`,
      'DAILY_LIMIT_EXCEEDED',
      429,
    )
    this.name = 'RateLimitExceededError'
  }
}

export class NotFoundError extends TenantScaleError {
  constructor(resource: string, id?: string) {
    super(id ? `${resource} not found: ${id}` : `${resource} not found`, 'NOT_FOUND', 404)
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends TenantScaleError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409)
    this.name = 'ConflictError'
  }
}

/** Logger interface used across the SDK */
export interface Logger {
  info: (...args: any[]) => void
  warn: (...args: any[]) => void
  error: (...args: any[]) => void
}

// ── DB Type Helpers (re-exported for convenience) ──

export interface DbTenant {
  id: string
  name: string
  slug: string
  plan_id: string
  features: Record<string, unknown>
  config: Record<string, unknown>
  settings: Record<string, unknown>
  is_active: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface DbAuditEvent {
  id: string
  tenant_id: string
  actor_id: string | null
  actor_type: string
  action: string
  resource: string
  details: Record<string, unknown>
  ip: string | null
  user_agent: string | null
  created_at: string
}

export interface DbApiKey {
  id: string
  tenant_id: string
  label: string
  key_hash: string
  key_prefix: string
  scopes: string[]
  is_active: boolean
  expires_at: string | null
  last_used_at: string | null
  created_by: string | null
  created_at: string
}

export interface DbWebhook {
  id: string
  tenant_id: string
  url: string
  events: string[]
  secret: string
  description: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface DbPlan {
  id: string
  name: string
  description: string | null
  price_monthly: number
  features: Record<string, unknown>
  max_users: number | null
  max_tenants: number | null
  max_api_keys: number | null
  api_calls_per_day: number | null
  audit_retention_days: number | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface DbTenantUser {
  id: string
  tenant_id: string
  user_id: string
  role: string
  invited_by: string | null
  joined_at: string
}

export interface DbSubscription {
  id: string
  tenant_id: string
  stripe_subscription_id: string
  stripe_customer_id: string
  stripe_price_id: string
  status: string
  plan_id: string
  billing_interval: string
  current_period_start: string | null
  current_period_end: string | null
  canceled_at: string | null
  ended_at: string | null
  trial_start: string | null
  trial_end: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}
