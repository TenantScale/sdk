// ──────────────────────────────────────────────────────
// Rate Limiter — plan-aware daily API call limiter + IP creation guard
// Framework-agnostic: pure logic, returns results
// ──────────────────────────────────────────────────────

import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApiKeyInfo, RateLimitResult, IpCreationLimitResult, Logger } from './types.js'
import { RateLimitExceededError } from './types.js'

// ── Constants ──

const KEY_CACHE_TTL_MS = 5 * 60 * 1000
const MAX_CREATIONS_PER_IP = 5
const CREATION_WINDOW_MS = 3_600_000 // 1 hour
const CLEANUP_INTERVAL_MS = 300_000 // 5 min

// ── Internal Types ──

interface KeyCacheEntry {
  tenant_id: string
  plan_id: string
  fetchedAt: number
}

interface PlanLimitCacheEntry {
  limit: number | null
  fetchedAt: number
}

interface IpCreationEntry {
  timestamps: number[]
}

// ── Rate Limiter Class ──

export class RateLimiter {
  private keyCache = new Map<string, KeyCacheEntry>()
  private planLimitCache = new Map<string, PlanLimitCacheEntry>()
  private ipCreationStore = new Map<string, IpCreationEntry>()
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
    this.cleanupTimer = setInterval(() => {
      const now = Date.now()

      // Clean key cache
      for (const [key, entry] of Array.from(this.keyCache.entries())) {
        if (now - entry.fetchedAt > KEY_CACHE_TTL_MS) {
          this.keyCache.delete(key)
        }
      }

      // Clean plan limit cache
      for (const [key, entry] of Array.from(this.planLimitCache.entries())) {
        if (now - entry.fetchedAt > KEY_CACHE_TTL_MS) {
          this.planLimitCache.delete(key)
        }
      }

      // Clean IP creation store
      const cutoff = now - CREATION_WINDOW_MS
      for (const [ip, entry] of Array.from(this.ipCreationStore.entries())) {
        entry.timestamps = entry.timestamps.filter((t) => t > cutoff)
        if (entry.timestamps.length === 0) {
          this.ipCreationStore.delete(ip)
        }
      }
    }, CLEANUP_INTERVAL_MS)

    this.cleanupTimer?.unref()
  }

  /**
   * Stop all cleanup timers. Call when destroying the limiter.
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
    this.keyCache.clear()
    this.planLimitCache.clear()
    this.ipCreationStore.clear()
  }

  // ── Daily API Call Limiter ──

  private getTodayKey(): string {
    const now = new Date()
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`
  }

  /**
   * Check the daily API call limit for a tenant.
   * Uses Postgres `increment_rate_limit` RPC for atomic counters.
   *
   * @param apiKey - Resolved API key info (from validateApiKey)
   * @returns Rate limit result with allowed/remaining/limit/current
   * @throws RateLimitExceededError if the daily limit is exceeded
   */
  async checkDailyLimit(apiKey: ApiKeyInfo): Promise<RateLimitResult> {
    const tenantId = apiKey.tenant_id

    // ── 1. Resolve plan's daily limit ──
    let dailyLimit = await this.getPlanDailyLimit(tenantId)

    // null = unlimited
    if (dailyLimit === null || dailyLimit === 0) {
      return { allowed: true, remaining: Infinity, limit: Infinity, current: 0 }
    }

    // ── 2. Increment and check counter ──
    const today = this.getTodayKey()

    try {
      const { data, error } = await this.supabase
        .rpc('increment_rate_limit', {
          p_tenant_id: tenantId,
          p_date: today,
        })
        .single()

      if (error) {
        this.logger.warn(
          { reason: 'db_increment_failed' },
          '[RateLimiter] Failed to increment — allowing request',
        )
        return { allowed: true, remaining: dailyLimit, limit: dailyLimit, current: 0 }
      }

      const currentCount = (data as { current_count: number } | undefined)?.current_count ?? 0

      if (currentCount > dailyLimit) {
        throw new RateLimitExceededError(dailyLimit)
      }

      return {
        allowed: true,
        remaining: Math.max(0, dailyLimit - currentCount),
        limit: dailyLimit,
        current: currentCount,
      }
    } catch (err) {
      if (err instanceof RateLimitExceededError) throw err
      this.logger.error(
        { reason: 'rate_limit_check_exception' },
        '[RateLimiter] Rate limit check threw — allowing request',
      )
      return { allowed: true, remaining: dailyLimit, limit: dailyLimit, current: 0 }
    }
  }

  /**
   * Non-throwing version of checkDailyLimit — returns result instead of throwing.
   */
  async peekDailyLimit(apiKey: ApiKeyInfo): Promise<RateLimitResult> {
    try {
      return await this.checkDailyLimit(apiKey)
    } catch {
      return { allowed: false, remaining: 0, limit: 0, current: 0 }
    }
  }

  private async getPlanDailyLimit(tenantId: string): Promise<number | null> {
    // Check cache
    const cached = this.planLimitCache.get(tenantId)
    if (cached && Date.now() - cached.fetchedAt < KEY_CACHE_TTL_MS) {
      return cached.limit
    }

    // Look up tenant's plan
    const { data: tenant } = await this.supabase
      .from('tenants')
      .select('plan_id')
      .eq('id', tenantId)
      .single()

    if (!tenant) return null

    const { data: plan } = await this.supabase
      .from('plans')
      .select('api_calls_per_day')
      .eq('id', tenant.plan_id)
      .single()

    const limit = plan?.api_calls_per_day ?? null

    if (limit !== null) {
      this.planLimitCache.set(tenantId, { limit, fetchedAt: Date.now() })
    }

    return limit
  }

  // ── IP-Based Creation Limiter ──

  /**
   * Check if an IP has exceeded the per-IP creation rate limit.
   * Max 5 creations per hour per IP.
   *
   * @param ip - The client IP address
   * @returns Result with blocked status, remaining, and reset timestamp
   */
  checkIpCreationLimit(ip: string): IpCreationLimitResult {
    const now = Date.now()
    const cutoff = now - CREATION_WINDOW_MS

    let entry = this.ipCreationStore.get(ip)
    if (!entry) {
      entry = { timestamps: [] }
      this.ipCreationStore.set(ip, entry)
    }

    // Prune expired timestamps
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff)

    const blocked = entry.timestamps.length >= MAX_CREATIONS_PER_IP

    if (!blocked) {
      entry.timestamps.push(now)
    }

    // Find the earliest timestamp to calculate reset time
    const earliest = entry.timestamps.length > 0 ? Math.min(...entry.timestamps) : now
    const resetAtMs = earliest + CREATION_WINDOW_MS

    return {
      blocked,
      remaining: Math.max(0, MAX_CREATIONS_PER_IP - entry.timestamps.length),
      resetAtMs,
    }
  }

  /**
   * Reset all IP creation state (for testing or manual unblock).
   */
  resetIpCreationStore(): void {
    this.ipCreationStore.clear()
  }

  /**
   * Resolve tenant_id from a raw API key (cached).
   * Used internally by the rate limiter when auth middleware hasn't run.
   */
  async resolveTenantId(rawKey: string): Promise<string | null> {
    const keyHash = createHash('sha256').update(rawKey).digest('hex')

    // Check cache
    const cached = this.keyCache.get(keyHash)
    if (cached && Date.now() - cached.fetchedAt < KEY_CACHE_TTL_MS) {
      return cached.tenant_id
    }

    try {
      const { data: keyRecord } = await this.supabase
        .from('api_keys')
        .select('tenant_id')
        .eq('key_hash', keyHash)
        .single()

      if (keyRecord) {
        this.keyCache.set(keyHash, {
          tenant_id: keyRecord.tenant_id,
          plan_id: '',
          fetchedAt: Date.now(),
        })
        return keyRecord.tenant_id
      }
    } catch {
      // Allow through on lookup failure
    }

    return null
  }
}
