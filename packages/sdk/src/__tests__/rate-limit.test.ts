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
// RateLimiter — Comprehensive Unit Tests
// ──────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RateLimiter } from '../rate-limit.js'
import { RateLimitExceededError } from '../types.js'
import type { ApiKeyInfo } from '../types.js'

// ── Helpers ──

/**
 * Build a minimal Supabase mock.
 * - `.from(table).select().eq().single()` resolves per-table rows.
 * - `.rpc(name, params).single()` resolves the configured RPC result.
 * Also records table queries and RPC calls so tests can assert call counts.
 */
function makeSupabase(
  results: Record<string, { data: unknown; error: unknown }> = {},
  rpcResult: { data: unknown; error: unknown } = { data: null, error: null },
) {
  const tablesQueried: string[] = []
  const rpcCalls: { name: string; params: unknown }[] = []
  const supabase = {
    from: (table: string) => {
      tablesQueried.push(table)
      return {
        select: () => ({
          eq: () => ({
            single: async () => results[table] ?? { data: null, error: null },
          }),
        }),
      }
    },
    rpc: (name: string, params: unknown) => {
      rpcCalls.push({ name, params })
      return { single: async () => rpcResult }
    },
  }
  return { supabase, tablesQueried, rpcCalls }
}

/** A resolved ApiKeyInfo as passed to checkDailyLimit. */
function apiKey(overrides: Partial<ApiKeyInfo> = {}): ApiKeyInfo {
  return {
    raw: 'tk_secret',
    tenant_id: 'tenant_001',
    scopes: ['read:users'],
    created_by: null,
    key_record_id: 'key_001',
    ...overrides,
  }
}

/** Default rows: tenant_001 → plan_pro with a 100/day API limit. */
function defaultResults() {
  return {
    tenants: { data: { plan_id: 'plan_pro' }, error: null },
    plans: { data: { api_calls_per_day: 100 }, error: null },
  }
}

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ══════════════════════════════════════════════════════
  // checkDailyLimit — unlimited
  // ══════════════════════════════════════════════════════

  // Test: unlimited plans bypass the counter entirely
  // Category: Happy Path
  // What it proves: When api_calls_per_day is null, requests are always allowed
  // Risk if missing: Unlimited plans would be incorrectly rate-limited
  it('allows unlimited plans without incrementing the counter', async () => {
    const { supabase, rpcCalls } = makeSupabase({
      tenants: { data: { plan_id: 'plan_pro' }, error: null },
      plans: { data: { api_calls_per_day: null }, error: null },
    })
    const limiter = new RateLimiter(supabase as any)
    limiter.destroy()

    const result = await limiter.checkDailyLimit(apiKey())

    expect(result).toEqual({
      allowed: true,
      remaining: Infinity,
      limit: Infinity,
      current: 0,
    })
    expect(rpcCalls).toHaveLength(0)
  })

  // Test: a zero daily limit is treated as unlimited
  // Category: Happy Path — Edge of Happy
  // What it proves: 0 behaves identically to null (the intent of the constant)
  // Risk if missing: A 0 config could lock tenants out of their API
  it('treats a zero daily limit as unlimited', async () => {
    const { supabase, rpcCalls } = makeSupabase({
      tenants: { data: { plan_id: 'plan_pro' }, error: null },
      plans: { data: { api_calls_per_day: 0 }, error: null },
    })
    const limiter = new RateLimiter(supabase as any)
    limiter.destroy()

    const result = await limiter.checkDailyLimit(apiKey())
    expect(result.allowed).toBe(true)
    expect(rpcCalls).toHaveLength(0)
  })

  // ══════════════════════════════════════════════════════
  // checkDailyLimit — within / over the limit
  // ══════════════════════════════════════════════════════

  // Test: allows a request under the daily limit
  // Category: Happy Path
  // What it proves: current <= limit returns allowed with correct remaining
  // Risk if missing: Legitimate traffic would be blocked below the limit
  it('allows a request when the count is under the daily limit', async () => {
    const { supabase, rpcCalls } = makeSupabase(defaultResults(), {
      data: { current_count: 5 },
      error: null,
    })
    const limiter = new RateLimiter(supabase as any)
    limiter.destroy()

    const result = await limiter.checkDailyLimit(apiKey())

    expect(result).toEqual({ allowed: true, remaining: 95, limit: 100, current: 5 })
    expect(rpcCalls[0].name).toBe('increment_rate_limit')
  })

  // Test: throws RateLimitExceededError when the count exceeds the limit
  // Category: Unhappy Path
  // What it proves: A count above the limit denies with the SDK error class
  // Risk if missing: Tenants could exceed their paid quota
  it('throws RateLimitExceededError when the daily limit is exceeded', async () => {
    const { supabase } = makeSupabase(defaultResults(), {
      data: { current_count: 101 },
      error: null,
    })
    const limiter = new RateLimiter(supabase as any)
    limiter.destroy()

    await expect(limiter.checkDailyLimit(apiKey())).rejects.toBeInstanceOf(RateLimitExceededError)
    await expect(limiter.checkDailyLimit(apiKey())).rejects.toThrow('Daily API call limit reached')
  })

  // Test: fails open when the counter increment errors
  // Category: Error Handling
  // What it proves: A DB increment failure allows the request rather than blocking it
  // Risk if missing: A transient counter outage would lock everyone out
  it('allows the request when the counter increment fails', async () => {
    const { supabase } = makeSupabase(defaultResults(), {
      data: null,
      error: new Error('rpc failed'),
    })
    const limiter = new RateLimiter(supabase as any)
    limiter.destroy()

    const result = await limiter.checkDailyLimit(apiKey())
    expect(result).toEqual({ allowed: true, remaining: 100, limit: 100, current: 0 })
  })

  // Test: peekDailyLimit returns a safe denial instead of throwing
  // Category: Error Handling
  // What it proves: The non-throwing variant swallows RateLimitExceededError
  // Risk if missing: Callers using peek could crash on a quota hit
  it('peekDailyLimit returns a non-throwing denial when over the limit', async () => {
    const { supabase } = makeSupabase(defaultResults(), {
      data: { current_count: 999 },
      error: null,
    })
    const limiter = new RateLimiter(supabase as any)
    limiter.destroy()

    const result = await limiter.peekDailyLimit(apiKey())
    expect(result).toEqual({ allowed: false, remaining: 0, limit: 0, current: 0 })
  })

  // ══════════════════════════════════════════════════════
  // checkDailyLimit — plan limit caching
  // ══════════════════════════════════════════════════════

  // Test: the plan's daily limit is cached across calls
  // Category: Happy Path
  // What it proves: Repeated checks for one tenant query the plan only once
  // Risk if missing: The cache would fail to protect the DB from repeated reads
  it('caches the plan daily limit across calls', async () => {
    const { supabase, tablesQueried } = makeSupabase(defaultResults(), {
      data: { current_count: 1 },
      error: null,
    })
    const limiter = new RateLimiter(supabase as any)
    limiter.destroy()

    await limiter.checkDailyLimit(apiKey())
    await limiter.checkDailyLimit(apiKey())

    expect(tablesQueried.filter((t) => t === 'tenants')).toHaveLength(1)
    expect(tablesQueried.filter((t) => t === 'plans')).toHaveLength(1)
  })

  // ══════════════════════════════════════════════════════
  // checkIpCreationLimit — per-IP creation guard
  // ══════════════════════════════════════════════════════

  // Test: allows creations up to the per-IP maximum
  // Category: Happy Path
  // What it proves: The first 5 creations from an IP are not blocked
  // Risk if missing: Legitimate signups from a shared IP would be blocked
  it('allows creations up to the per-IP maximum (5)', () => {
    const limiter = new RateLimiter({} as any)
    limiter.destroy()

    let result
    for (let i = 0; i < 5; i++) {
      result = limiter.checkIpCreationLimit('203.0.113.7')
      expect(result.blocked).toBe(false)
    }
    // Covers remaining declining from 4 down to 0.
    expect(result).toMatchObject({ blocked: false, remaining: 0 })
  })

  // Test: blocks the 6th creation from the same IP
  // Category: Unhappy Path
  // What it proves: Exceeding the max blocks further creations
  // Risk if missing: IP-based abuse could create unlimited accounts
  it('blocks the 6th creation from the same IP', () => {
    const limiter = new RateLimiter({} as any)
    limiter.destroy()

    for (let i = 0; i < 5; i++) limiter.checkIpCreationLimit('203.0.113.9')
    const blocked = limiter.checkIpCreationLimit('203.0.113.9')

    expect(blocked.blocked).toBe(true)
    expect(blocked.remaining).toBe(0)
  })

  // Test: different IPs are tracked independently
  // Category: Happy Path
  // What it proves: One blocked IP does not block another
  // Risk if missing: A single abusive IP would block all users sharing infrastructure
  it('tracks different IPs independently', () => {
    const limiter = new RateLimiter({} as any)
    limiter.destroy()

    for (let i = 0; i < 5; i++) limiter.checkIpCreationLimit('203.0.113.20')
    const other = limiter.checkIpCreationLimit('203.0.113.21')

    expect(other.blocked).toBe(false)
    expect(other.remaining).toBe(4)
  })

  // Test: resetIpCreationStore clears per-IP state
  // Category: Lifecycle
  // What it proves: After reset, a previously blocked IP is allowed again
  // Risk if missing: An admin unblock would never take effect
  it('resetIpCreationStore clears per-IP state', () => {
    const limiter = new RateLimiter({} as any)
    limiter.destroy()

    for (let i = 0; i < 5; i++) limiter.checkIpCreationLimit('203.0.113.30')
    expect(limiter.checkIpCreationLimit('203.0.113.30').blocked).toBe(true)

    limiter.resetIpCreationStore()
    expect(limiter.checkIpCreationLimit('203.0.113.30').blocked).toBe(false)
  })

  // ══════════════════════════════════════════════════════
  // resolveTenantId — API key → tenant resolution
  // ══════════════════════════════════════════════════════

  // Test: resolves a tenant from a known API key
  // Category: Happy Path
  // What it proves: A matching key record returns its tenant_id
  // Risk if missing: Auth middleware that skipped key resolution would break
  it('resolves a tenant from a matching API key', async () => {
    const { supabase } = makeSupabase({
      api_keys: { data: { tenant_id: 'tenant_007' }, error: null },
    })
    const limiter = new RateLimiter(supabase as any)
    limiter.destroy()

    await expect(limiter.resolveTenantId('tk_abc123')).resolves.toBe('tenant_007')
  })

  // Test: returns null when no key record matches
  // Category: Unhappy Path
  // What it proves: An unknown key yields null rather than a guessed tenant
  // Risk if missing: An unknown key could be attributed to the wrong tenant
  it('returns null for an unknown API key', async () => {
    const { supabase } = makeSupabase({})
    const limiter = new RateLimiter(supabase as any)
    limiter.destroy()

    await expect(limiter.resolveTenantId('tk_unknown')).resolves.toBeNull()
  })

  // Test: caches the key→tenant resolution
  // Category: Happy Path
  // What it proves: Repeated resolutions for one key hit the cache, not the DB
  // Risk if missing: Every request would pay a DB round-trip
  it('caches key-to-tenant resolution', async () => {
    const { supabase, tablesQueried } = makeSupabase({
      api_keys: { data: { tenant_id: 'tenant_007' }, error: null },
    })
    const limiter = new RateLimiter(supabase as any)
    limiter.destroy()

    await limiter.resolveTenantId('tk_abc123')
    await limiter.resolveTenantId('tk_abc123')

    expect(tablesQueried.filter((t) => t === 'api_keys')).toHaveLength(1)
  })

  // ══════════════════════════════════════════════════════
  // Lifecycle
  // ══════════════════════════════════════════════════════

  // Test: destroy clears state without throwing
  // Category: Lifecycle
  // What it proves: destroy releases timers and caches safely
  // Risk if missing: Leaked timers would keep the process alive
  it('destroy clears state without throwing', () => {
    const limiter = new RateLimiter({} as any)
    expect(() => limiter.destroy()).not.toThrow()
    // State is cleared, so a fresh call re-attempts the DB rather than throwing.
    expect(() => limiter.checkIpCreationLimit('203.0.113.40')).not.toThrow()
  })
})
