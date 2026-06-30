// ──────────────────────────────────────────────────────
// Plan Store — cached plan lookups
// 5-minute TTL to avoid hammering the DB on every request.
// ──────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PlanInfo, Logger } from './types.js'

const PLAN_CACHE_TTL_MS = 5 * 60 * 1000

interface PlanCacheEntry {
  plan: PlanInfo
  fetchedAt: number
}

/**
 * Cached plan store — resolves tenant plans and feature limits.
 * Thread-safe for concurrent requests (read-only cache, mutations
 * only used for invalidation which is rare).
 *
 * Used internally by the TenantScale class and available for
 * direct use by adapters.
 */
export class PlanStore {
  private cache = new Map<string, PlanCacheEntry>()
  private cleanupTimer: ReturnType<typeof setInterval> | null = null
  private logger: Logger

  constructor(
    private supabase: SupabaseClient,
    logger?: Logger,
  ) {
    this.logger = logger ?? console
    this.startCleanup()
  }

  private startCleanup(): void {
    // Periodic cleanup every 10 minutes
    this.cleanupTimer = setInterval(() => {
      const now = Date.now()
      for (const [key, entry] of Array.from(this.cache.entries())) {
        if (now - entry.fetchedAt > PLAN_CACHE_TTL_MS) {
          this.cache.delete(key)
        }
      }
    }, PLAN_CACHE_TTL_MS * 2)

    this.cleanupTimer?.unref()
  }

  /**
   * Stop the cleanup timer. Call when destroying the store.
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
    this.cache.clear()
  }

  /**
   * Resolve plan for a tenant. Cached for 5 minutes.
   * Returns null on error.
   */
  async getPlanForTenant(tenantId: string): Promise<PlanInfo | null> {
    const cached = this.cache.get(tenantId)
    if (cached && Date.now() - cached.fetchedAt < PLAN_CACHE_TTL_MS) {
      return cached.plan
    }

    const { data: tenant, error: tenantError } = await this.supabase
      .from('tenants')
      .select('plan_id')
      .eq('id', tenantId)
      .single()

    if (tenantError || !tenant) {
      this.logger.warn({ tenantId, error: tenantError }, 'Failed to fetch tenant for plan lookup')
      return null
    }

    const { data: plan, error: planError } = await this.supabase
      .from('plans')
      .select('*')
      .eq('id', tenant.plan_id)
      .single()

    if (planError || !plan) {
      this.logger.warn({ tenantId, planId: tenant.plan_id, error: planError }, 'Failed to fetch plan')
      return null
    }

    const features = (plan.features ?? {}) as Record<string, unknown>

    const result: PlanInfo = {
      id: plan.id,
      name: plan.name,
      price_monthly: plan.price_monthly,
      max_users: plan.max_users ?? null,
      max_tenants: plan.max_tenants ?? null,
      max_api_keys: plan.max_api_keys ?? null,
      api_calls_per_day: plan.api_calls_per_day ?? null,
      audit_retention_days: plan.audit_retention_days ?? null,
      features: {},
      _raw_features: features,
    }

    // Flatten JSONB features into the features map with typed access
    for (const [key, value] of Object.entries(features)) {
      if (value === null) {
        result.features[key] = null
      } else if (typeof value === 'boolean') {
        result.features[key] = value
      } else if (typeof value === 'number') {
        result.features[key] = value
      } else if (typeof value === 'string') {
        result.features[key] = value
      } else {
        result.features[key] = null
      }
    }

    this.cache.set(tenantId, { plan: result, fetchedAt: Date.now() })
    return result
  }

  /**
   * Check if a tenant's plan has a specific feature enabled.
   * Returns false unless the feature is explicitly `true` in the DB.
   * Fail-closed: can't reach DB → deny.
   */
  async hasPlanFeature(tenantId: string, feature: string): Promise<boolean> {
    const plan = await this.getPlanForTenant(tenantId)
    if (!plan) return false

    const value = plan._raw_features[feature]
    return value === true
  }

  /**
   * Get a numeric limit from the tenant's plan.
   * Checks direct columns first, then falls back to features JSONB.
   * Returns null for unlimited. Returns 0 if plan can't be resolved (fail-closed).
   */
  async getPlanLimit(tenantId: string, limitField: string): Promise<number | null> {
    const plan = await this.getPlanForTenant(tenantId)
    if (!plan) return 0 // fail closed — can't confirm limit, deny

    // Check direct column first
    const asRecord = plan as unknown as Record<string, unknown>
    const directValue = asRecord[limitField]
    if (directValue !== undefined && directValue !== null && typeof directValue === 'number') {
      return directValue
    }

    // Fall back to features JSONB
    const featureValue = plan._raw_features[limitField]
    if (featureValue === null || featureValue === undefined) return null
    if (typeof featureValue === 'number') return featureValue
    if (typeof featureValue === 'boolean') return featureValue ? null : 0
    if (typeof featureValue === 'string') {
      const parsed = parseInt(featureValue, 10)
      return isNaN(parsed) ? null : parsed
    }

    return null
  }

  /**
   * Invalidate plan cache for a tenant (call after plan change / subscription update).
   */
  invalidate(tenantId: string): void {
    this.cache.delete(tenantId)
  }

  /**
   * Invalidate all plan cache entries (call after bulk plan changes).
   */
  invalidateAll(): void {
    this.cache.clear()
  }
}
