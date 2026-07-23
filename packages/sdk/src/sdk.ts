// ──────────────────────────────────────────────────────
// TenantScale — Main SDK class
// Framework-agnostic entry point
// ──────────────────────────────────────────────────────
//
// Usage:
//   import { TenantScale } from '@tenantscale/sdk'
//
//   const ts = new TenantScale({
//     supabaseUrl: process.env.SUPABASE_URL,
//     supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
//   })
//
//   // API key auth
//   const apiKey = await ts.validateApiKey('tk_abc123...')
//
//   // Rate limiting
//   const result = await ts.rateLimiter.checkDailyLimit(apiKey)
//
//   // Plan enforcement
//   const limit = await ts.plans.getPlanLimit(apiKey.tenant_id, 'max_tenants')
//
//   // Webhook dispatch (fire-and-forget)
//   ts.webhooks.dispatch('tenant.created', tenantId, data)

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type {
  TenantScaleOptions,
  ApiKeyInfo,
  PortalSessionInfo,
  AuditEventInput,
  Logger,
} from './types.js'
import { PlanStore } from './plan.js'
import { RateLimiter } from './rate-limit.js'
import { WebhookDispatcher } from './webhook.js'
import { validateApiKey, requireScope } from './auth.js'
import { validateSession, requirePortalRole, requireSuperAdmin } from './session.js'
import { logAuditEvent, getClientIp, setAuditLogger } from './audit.js'
import { generateApiKey, hashApiKey, isValidApiKeyFormat } from './api-key.js'
import { parsePaginationParams, paginationResponse } from './pagination.js'
import { StripeClient } from './stripe.js'

// ── Logger creation ──

function createLogger(logger?: Logger): Logger {
  return logger ?? console
}

// ── TenantScale Class ──

export class TenantScale {
  /** Supabase admin client (service_role) */
  readonly supabase: SupabaseClient

  /** Cached plan store — resolves tenant plans and feature limits */
  readonly plans: PlanStore

  /** Rate limiter — plan-aware daily API call limiting + IP creation guard */
  readonly rateLimiter: RateLimiter

  /** Webhook dispatcher — fire-and-forget event delivery */
  readonly webhooks: WebhookDispatcher

  /** Stripe client (optional — only available if stripeSecretKey was provided) */
  readonly stripe: StripeClient | null

  /** Logger instance */
  readonly logger: Logger

  /** Deployment mode label */
  readonly deploymentMode?: string

  constructor(options: TenantScaleOptions) {
    this.logger = createLogger(options.logger)
    this.deploymentMode = options.deploymentMode

    // Initialize Supabase client
    if (options.supabase) {
      this.supabase = options.supabase
    } else if (options.supabaseUrl && options.supabaseKey) {
      this.supabase = createClient(options.supabaseUrl, options.supabaseKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        db: {
          schema: 'public',
        },
        global: {
          fetch: (url: string | URL | Request, init?: RequestInit) =>
            fetch(url, { ...init, signal: AbortSignal.timeout(10_000) }),
        },
      })
    } else {
      throw new Error('TenantScale requires either a Supabase client or supabaseUrl + supabaseKey')
    }

    // Initialize modules
    this.plans = new PlanStore(this.supabase, this.logger)
    this.rateLimiter = new RateLimiter(this.supabase, this.logger)
    this.webhooks = new WebhookDispatcher(this.supabase, {
      logger: this.logger,
    })

    // Initialize Stripe (optional)
    if (options.stripeSecretKey) {
      this.stripe = new StripeClient(this.supabase, {
        secretKey: options.stripeSecretKey,
        apiVersion: options.stripeApiVersion,
        logger: this.logger,
      })
    } else {
      this.stripe = null
    }

    // Wire up audit logger
    setAuditLogger(this.logger)
  }

  /**
   * Cleanup resources (timers, caches). Call when shutting down.
   */
  destroy(): void {
    this.plans.destroy()
    this.rateLimiter.destroy()
  }

  // ── Auth ──

  /**
   * Validate a raw API key token against the database.
   * Returns resolved API key info, or throws an error.
   */
  async validateApiKey(token: string): Promise<ApiKeyInfo> {
    return validateApiKey(this.supabase, token)
  }

  /**
   * Assert that a key has at least one of the required scopes.
   */
  requireScope(apiKey: ApiKeyInfo, ...scopes: string[]): void {
    requireScope(apiKey, ...scopes)
  }

  // ── Session ──

  /**
   * Validate a Supabase session JWT and resolve the user's tenant membership.
   */
  async validateSession(jwt: string): Promise<PortalSessionInfo> {
    return validateSession(this.supabase, jwt)
  }

  /**
   * Assert that a portal session has at least one of the required roles.
   */
  requirePortalRole(session: PortalSessionInfo, ...roles: string[]): void {
    requirePortalRole(session, ...roles)
  }

  /**
   * Assert that a portal session is a super_admin.
   */
  requireSuperAdmin(session: PortalSessionInfo): void {
    requireSuperAdmin(session)
  }

  // ── Audit ──

  /**
   * Log an audit event to the database (fire-and-forget).
   */
  async logAuditEvent(input: AuditEventInput): Promise<void> {
    return logAuditEvent(this.supabase, input)
  }

  /**
   * Extract client IP from request headers.
   */
  getClientIp(headers: Headers | Record<string, string | string[] | undefined>): string {
    return getClientIp(headers)
  }

  // ── API Keys ──

  /**
   * Generate a new API key.
   */
  generateApiKey(): ReturnType<typeof generateApiKey> {
    return generateApiKey()
  }

  /**
   * Hash a raw API key for storage.
   */
  hashApiKey(rawKey: string): string {
    return hashApiKey(rawKey)
  }

  /**
   * Validate API key format.
   */
  isValidApiKeyFormat(key: string): boolean {
    return isValidApiKeyFormat(key)
  }

  // ── Pagination ──

  /**
   * Parse pagination parameters from query params.
   */
  parsePaginationParams(
    query: Record<string, string | undefined> | URLSearchParams,
    defaultLimit = 50,
  ) {
    return parsePaginationParams(query, defaultLimit)
  }

  /**
   * Build a pagination response object.
   */
  paginationResponse(page: number, limit: number, total: number) {
    return paginationResponse(page, limit, total)
  }
}
