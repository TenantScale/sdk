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
// PlanStore — Comprehensive Unit Tests
// ──────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PlanStore } from '../plan.js'

// ── Helpers ──

/**
 * Build a minimal Supabase mock whose `.single()` resolves per-table.
 * Results keyed by table name; any unconfigured table resolves to no row.
 * Also records every table queried so tests can assert cache behaviour.
 */
function makeSupabase(results: Record<string, { data: unknown; error: unknown }> = {}) {
  const tablesQueried: string[] = []
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
  }
  return { supabase, tablesQueried }
}

/** A realistic plans row returned by the mock DB for the "pro" plan. */
function proPlanRow() {
  return {
    data: {
      id: 'plan_pro',
      name: 'Pro',
      price_monthly: 49,
      max_users: 20,
      max_tenants: 5,
      max_api_keys: 10,
      api_calls_per_day: 10000,
      audit_retention_days: 365,
      features: {
        sso: true,
        audit_logs: 'extended',
        custom_webhooks: false,
        api_quota_bonus: 5000,
        unused_flag: null,
      },
    },
    error: null,
  }
}

describe('PlanStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ══════════════════════════════════════════════════════
  // Happy Path — plan resolution
  // ══════════════════════════════════════════════════════

  // Test: resolves a full plan for a tenant
  // Category: Happy Path
  // What it proves: Mapping a tenants.plan_id → plans row yields a typed PlanInfo
  // Risk if missing: The core lookup flow would be untested
  it('resolves a full plan for a tenant', async () => {
    const { supabase } = makeSupabase({
      tenants: { data: { plan_id: 'plan_pro' }, error: null },
      plans: proPlanRow(),
    })
    const store = new PlanStore(supabase as any)
    store.destroy()

    const plan = await store.getPlanForTenant('tenant_a')

    expect(plan).toMatchObject({
      id: 'plan_pro',
      name: 'Pro',
      price_monthly: 49,
      max_users: 20,
      max_tenants: 5,
      max_api_keys: 10,
      api_calls_per_day: 10000,
      audit_retention_days: 365,
    })
  })

  // Test: flattens JSONB features into the typed features map
  // Category: Happy Path
  // What it proves: Features with boolean/number/string/null values map to typed fields
  // Risk if missing: Consumers relying on typed feature access would get undefined
  it('flattens JSONB features into the typed features map', async () => {
    const { supabase } = makeSupabase({
      tenants: { data: { plan_id: 'plan_pro' }, error: null },
      plans: proPlanRow(),
    })
    const store = new PlanStore(supabase as any)
    store.destroy()

    const plan = await store.getPlanForTenant('tenant_a')

    expect(plan?.features.sso).toBe(true)
    expect(plan?.features.audit_logs).toBe('extended')
    expect(plan?.features.custom_webhooks).toBe(false)
    expect(plan?.features.api_quota_bonus).toBe(5000)
    expect(plan?.features.unused_flag).toBe(null)
  })

  // Test: caches plan lookups within the 5-minute TTL
  // Category: Happy Path
  // What it proves: Repeated lookups for the same tenant hit the cache, not the DB
  // Risk if missing: The cache (purpose of this class) could silently stop protecting the DB
  it('caches plan lookups across calls', async () => {
    const { supabase, tablesQueried } = makeSupabase({
      tenants: { data: { plan_id: 'plan_pro' }, error: null },
      plans: proPlanRow(),
    })
    const store = new PlanStore(supabase as any)
    store.destroy()

    await store.getPlanForTenant('tenant_a')
    await store.getPlanForTenant('tenant_a')

    // Only one tenants query — the second lookup is served from cache.
    expect(tablesQueried.filter((t) => t === 'tenants')).toHaveLength(1)
  })

  // Test: tenants with different ids resolve independently (cache keyed by tenant)
  // Category: Happy Path
  // What it proves: Different tenants do not share cache entries
  // Risk if missing: Cross-tenant cache leakage would expose one tenant's plan to another
  it('does not share cache entries between tenants', async () => {
    const { supabase, tablesQueried } = makeSupabase({
      tenants: { data: { plan_id: 'plan_pro' }, error: null },
      plans: proPlanRow(),
    })
    const store = new PlanStore(supabase as any)
    store.destroy()

    await store.getPlanForTenant('tenant_a')
    await store.getPlanForTenant('tenant_b')

    expect(tablesQueried.filter((t) => t === 'tenants')).toHaveLength(2)
  })

  // ══════════════════════════════════════════════════════
  // Unhappy Path — DB errors / missing rows (fail-closed)
  // ══════════════════════════════════════════════════════

  // Test: returns null when the tenant lookup fails
  // Category: Unhappy Path
  // What it proves: A DB error for the tenants query surfaces as null, not a throw
  // Risk if missing: Callers could crash on transient DB issues instead of denying gracefully
  it('returns null when the tenant lookup errors', async () => {
    const { supabase } = makeSupabase({
      tenants: { data: null, error: new Error('DB down') },
    })
    const store = new PlanStore(supabase as any)
    store.destroy()

    const plan = await store.getPlanForTenant('tenant_a')
    expect(plan).toBeNull()
  })

  // Test: returns null when the tenant is missing
  // Category: Unhappy Path
  // What it proves: A missing tenants row resolves to null
  // Risk if missing: A dangling tenant id could resolve to an unexpected plan
  it('returns null when no tenant row is found', async () => {
    const { supabase } = makeSupabase({})
    const store = new PlanStore(supabase as any)
    store.destroy()

    const plan = await store.getPlanForTenant('missing_tenant')
    expect(plan).toBeNull()
  })

  // Test: returns null when the plan lookup fails
  // Category: Unhappy Path
  // What it proves: When the linked plan can't be read, the tenant still resolves to no plan
  // Risk if missing: A missing plan could yield a partially-populated plan object
  it('returns null when the plan lookup errors', async () => {
    const { supabase } = makeSupabase({
      tenants: { data: { plan_id: 'plan_pro' }, error: null },
      plans: { data: null, error: new Error('plan read failed') },
    })
    const store = new PlanStore(supabase as any)
    store.destroy()

    const plan = await store.getPlanForTenant('tenant_a')
    expect(plan).toBeNull()
  })

  // Test: defaults numeric limits to null when absent
  // Category: Unhappy Path
  // What it proves: Missing numeric columns become null instead of undefined
  // Risk if missing: Consumers doing number checks on limits could get NaN-like surprises
  it('defaults numeric limits to null when absent', async () => {
    const { supabase } = makeSupabase({
      tenants: { data: { plan_id: 'plan_pro' }, error: null },
      plans: {
        data: {
          id: 'plan_pro',
          name: 'Pro',
          price_monthly: 0,
          features: {},
        },
        error: null,
      },
    })
    const store = new PlanStore(supabase as any)
    store.destroy()

    const plan = await store.getPlanForTenant('tenant_a')
    expect(plan?.max_users).toBeNull()
    expect(plan?.api_calls_per_day).toBeNull()
    expect(plan?.audit_retention_days).toBeNull()
  })

  // ══════════════════════════════════════════════════════
  // hasPlanFeature — fail-closed gating
  // ══════════════════════════════════════════════════════

  // Test: returns true only when the feature is explicitly true
  // Category: Happy Path
  // What it proves: A feature stored as boolean true is granted
  // Risk if missing: Feature gating would be broken for enabled features
  it('grants a feature that is explicitly true', async () => {
    const { supabase } = makeSupabase({
      tenants: { data: { plan_id: 'plan_pro' }, error: null },
      plans: proPlanRow(),
    })
    const store = new PlanStore(supabase as any)
    store.destroy()

    await expect(store.hasPlanFeature('tenant_a', 'sso')).resolves.toBe(true)
  })

  // Test: denies a feature that is explicitly false
  // Category: Unhappy Path
  // What it proves: false features are denied
  // Risk if missing: Disabled features would be incorrectly granted
  it('denies a feature that is explicitly false', async () => {
    const { supabase } = makeSupabase({
      tenants: { data: { plan_id: 'plan_pro' }, error: null },
      plans: proPlanRow(),
    })
    const store = new PlanStore(supabase as any)
    store.destroy()

    await expect(store.hasPlanFeature('tenant_a', 'custom_webhooks')).resolves.toBe(false)
  })

  // Test: denies features with non-boolean truthy values (fail-closed)
  // Category: Unhappy Path
  // What it proves: Only literal `true` grants access; strings/numbers do not
  // Risk if missing: A truthy non-boolean value could accidentally enable a feature
  it('denies a feature stored as a non-boolean truthy value', async () => {
    const { supabase } = makeSupabase({
      tenants: { data: { plan_id: 'plan_pro' }, error: null },
      plans: proPlanRow(),
    })
    const store = new PlanStore(supabase as any)
    store.destroy()

    await expect(store.hasPlanFeature('tenant_a', 'audit_logs')).resolves.toBe(false)
  })

  // Test: denies all features when the plan can't be resolved (fail-closed)
  // Category: Unhappy Path — Fail-Closed Security
  // What it proves: If the DB is unreachable, feature access is denied, not granted
  // Risk if missing: An outage would inadvertently grant paid features
  it('denies features when the plan cannot be resolved', async () => {
    const { supabase } = makeSupabase({
      tenants: { data: null, error: new Error('DB down') },
    })
    const store = new PlanStore(supabase as any)
    store.destroy()

    await expect(store.hasPlanFeature('tenant_a', 'sso')).resolves.toBe(false)
  })

  // ══════════════════════════════════════════════════════
  // getPlanLimit — column + feature fallback, fail-closed
  // ══════════════════════════════════════════════════════

  // Test: reads a numeric limit from a direct column
  // Category: Happy Path
  // What it proves: Column limits like max_users return their stored number
  // Risk if missing: Direct column limits would be ignored in favour of features
  it('reads a numeric limit from a direct column', async () => {
    const { supabase } = makeSupabase({
      tenants: { data: { plan_id: 'plan_pro' }, error: null },
      plans: proPlanRow(),
    })
    const store = new PlanStore(supabase as any)
    store.destroy()

    await expect(store.getPlanLimit('tenant_a', 'max_users')).resolves.toBe(20)
  })

  // Test: falls back to the features JSONB for a missing column
  // Category: Happy Path
  // What it proves: api_quota_bonus lives only in features and is returned
  // Risk if missing: Feature-only limits would be impossible to enforce
  it('falls back to the features JSONB for a missing column', async () => {
    const { supabase } = makeSupabase({
      tenants: { data: { plan_id: 'plan_pro' }, error: null },
      plans: proPlanRow(),
    })
    const store = new PlanStore(supabase as any)
    store.destroy()

    await expect(store.getPlanLimit('tenant_a', 'api_quota_bonus')).resolves.toBe(5000)
  })

  // Test: parses a string-encoded numeric feature
  // Category: Happy Path — Edge of Happy
  // What it proves: String feature values are parsed to numbers
  // Risk if missing: String-encoded limits would return null
  it('parses a string-encoded numeric feature', async () => {
    const { supabase } = makeSupabase({
      tenants: { data: { plan_id: 'plan_pro' }, error: null },
      plans: {
        data: {
          id: 'plan_pro',
          name: 'Pro',
          price_monthly: 49,
          features: { vcpus: '4' },
        },
        error: null,
      },
    })
    const store = new PlanStore(supabase as any)
    store.destroy()

    await expect(store.getPlanLimit('tenant_a', 'vcpus')).resolves.toBe(4)
  })

  // Test: returns null for an unknown limit (unlimited)
  // Category: Unhappy Path
  // What it proves: An absent limit means unlimited (null), per the API contract
  // Risk if missing: Unknown limits could be wrongly treated as a hard zero
  it('returns null for an unknown limit (treated as unlimited)', async () => {
    const { supabase } = makeSupabase({
      tenants: { data: { plan_id: 'plan_pro' }, error: null },
      plans: proPlanRow(),
    })
    const store = new PlanStore(supabase as any)
    store.destroy()

    await expect(store.getPlanLimit('tenant_a', 'does_not_exist')).resolves.toBeNull()
  })

  // Test: returns 0 (deny) when the plan cannot be resolved (fail-closed)
  // Category: Unhappy Path — Fail-Closed Security
  // What it proves: An unresolvable plan returns 0, blocking the caller
  // Risk if missing: An unreachable DB would let unlimited usage slip through
  it('returns 0 (deny) when the plan cannot be resolved', async () => {
    const { supabase } = makeSupabase({
      tenants: { data: null, error: new Error('DB down') },
    })
    const store = new PlanStore(supabase as any)
    store.destroy()

    await expect(store.getPlanLimit('tenant_a', 'max_users')).resolves.toBe(0)
  })

  // ══════════════════════════════════════════════════════
  // Cache invalidation
  // ══════════════════════════════════════════════════════

  // Test: invalidate clears a single tenant's cache entry
  // Category: Happy Path
  // What it proves: After invalidate, the next lookup re-queries the DB
  // Risk if missing: A plan change would never be reflected
  it('invalidate clears a single tenant and forces a refresh', async () => {
    const { supabase, tablesQueried } = makeSupabase({
      tenants: { data: { plan_id: 'plan_pro' }, error: null },
      plans: proPlanRow(),
    })
    const store = new PlanStore(supabase as any)
    store.destroy()

    await store.getPlanForTenant('tenant_a')
    await store.getPlanForTenant('tenant_a')
    expect(tablesQueried.filter((t) => t === 'tenants')).toHaveLength(1)

    store.invalidate('tenant_a')
    await store.getPlanForTenant('tenant_a')
    expect(tablesQueried.filter((t) => t === 'tenants')).toHaveLength(2)
  })

  // Test: invalidateAll clears the entire cache
  // Category: Happy Path
  // What it proves: Bulk invalidation clears every tenant entry
  // Risk if missing: Bulk plan changes would leave stale cache entries
  it('invalidateAll clears the entire cache', async () => {
    const { supabase, tablesQueried } = makeSupabase({
      tenants: { data: { plan_id: 'plan_pro' }, error: null },
      plans: proPlanRow(),
    })
    const store = new PlanStore(supabase as any)
    store.destroy()

    await store.getPlanForTenant('tenant_a')
    await store.getPlanForTenant('tenant_b')
    expect(tablesQueried.filter((t) => t === 'tenants')).toHaveLength(2)

    store.invalidateAll()
    await store.getPlanForTenant('tenant_a')
    await store.getPlanForTenant('tenant_b')
    expect(tablesQueried.filter((t) => t === 'tenants')).toHaveLength(4)
  })

  // Test: destroy stops the cleanup timer and clears the cache
  // Category: Lifecycle
  // What it proves: destroy releases the interval and cache without throwing
  // Risk if missing: Leaked timers would keep the process alive
  it('destroy clears the cache without throwing', async () => {
    const { supabase } = makeSupabase({
      tenants: { data: { plan_id: 'plan_pro' }, error: null },
      plans: proPlanRow(),
    })
    const store = new PlanStore(supabase as any)

    await store.getPlanForTenant('tenant_a')
    expect(() => store.destroy()).not.toThrow()
    // After destroy, the cache is empty so this re-queries rather than throwing.
    await expect(store.getPlanForTenant('tenant_a')).resolves.toMatchObject({ id: 'plan_pro' })
  })
})
