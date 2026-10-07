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
// StripeClient — Comprehensive Unit Tests
// ──────────────────────────────────────────────────────
// NOTE: Network calls are never made. The pure helpers are exercised directly,
// and the lazily-created Stripe client's resource methods are stubbed via spies.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StripeClient } from '../stripe.js'

// ── Helpers ──

function makeClient(customerRow?: { data: unknown; error: unknown }) {
  const mockInsert = vi.fn(async () => ({ error: null }))
  const tablesQueried: string[] = []
  const mockFrom = vi.fn((table: string) => {
    tablesQueried.push(table)
    return {
      select: () => ({
        eq: () => ({
          single: async () => customerRow ?? { data: null, error: null },
          maybeSingle: async () => customerRow ?? { data: null, error: null },
        }),
      }),
      insert: mockInsert,
    }
  })
  const supabase = { from: mockFrom }
  const client = new StripeClient(supabase as any, { secretKey: 'sk_test_fake' })
  return { client, supabase, mockFrom, mockInsert, tablesQueried }
}

describe('StripeClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ══════════════════════════════════════════════════════
  // Price mapping — pure helpers
  // ══════════════════════════════════════════════════════

  // Test: getPriceId returns the monthly price for a mapped plan
  // Category: Happy Path
  // What it proves: A configured plan resolves to its monthly price id
  // Risk if missing: Checkout would be wired to the wrong price
  it('returns the monthly price id for a mapped plan', () => {
    const { client } = makeClient()
    client.setPriceMapping('hobby', { monthly: 'price_m_hobby', yearly: 'price_y_hobby' })

    expect(client.getPriceId('hobby', 'month')).toBe('price_m_hobby')
  })

  // Test: getPriceId returns the yearly price for a mapped plan
  // Category: Happy Path
  // What it proves: The yearly interval resolves to the yearly price id
  // Risk if missing: Yearly checkout would charge the monthly price
  it('returns the yearly price id for a mapped plan', () => {
    const { client } = makeClient()
    client.setPriceMapping('hobby', { monthly: 'price_m_hobby', yearly: 'price_y_hobby' })

    expect(client.getPriceId('hobby', 'year')).toBe('price_y_hobby')
  })

  // Test: getPriceId returns undefined for an unmapped plan
  // Category: Unhappy Path
  // What it proves: Unknown plans yield undefined rather than a bogus id
  // Risk if missing: Checkout for an unmapped plan would silently use the wrong price
  it('returns undefined for an unmapped plan', () => {
    const { client } = makeClient()
    expect(client.getPriceId('enterprise', 'month')).toBeUndefined()
  })

  // Test: resolvePlanFromPrice maps a price id back to plan + interval
  // Category: Happy Path
  // What it proves: Webhook price ids resolve to the originating plan and interval
  // Risk if missing: Webhook-driven plan changes couldn't be attributed
  it('resolves a price id back to its plan and interval', () => {
    const { client } = makeClient()
    client.setPriceMapping('hobby', { monthly: 'price_m_hobby', yearly: 'price_y_hobby' })

    expect(client.resolvePlanFromPrice('price_m_hobby')).toEqual({
      planId: 'hobby',
      interval: 'month',
    })
    expect(client.resolvePlanFromPrice('price_y_hobby')).toEqual({
      planId: 'hobby',
      interval: 'year',
    })
  })

  // Test: resolvePlanFromPrice returns null for an unknown price id
  // Category: Unhappy Path
  // What it proves: Unrecognized price ids resolve to null
  // Risk if missing: An external price id could be misattributed to a plan
  it('returns null for an unknown price id', () => {
    const { client } = makeClient()
    client.setPriceMapping('hobby', { monthly: 'price_m_hobby', yearly: 'price_y_hobby' })

    expect(client.resolvePlanFromPrice('price_other')).toBeNull()
  })

  // Test: setPriceMappings merges multiple mappings at once
  // Category: Happy Path
  // What it proves: Bulk mapping adds to (not replaces) existing mappings
  // Risk if missing: Bulk config would clobber price ids configured individually
  it('setPriceMappings merges multiple mappings', () => {
    const { client } = makeClient()
    client.setPriceMapping('hobby', { monthly: 'price_m_hobby', yearly: 'price_y_hobby' })
    client.setPriceMappings({
      pro: { monthly: 'price_m_pro', yearly: 'price_y_pro' },
    })

    expect(client.resolvePlanFromPrice('price_m_hobby')).toEqual({
      planId: 'hobby',
      interval: 'month',
    })
    expect(client.resolvePlanFromPrice('price_y_pro')).toEqual({ planId: 'pro', interval: 'year' })
  })

  // ══════════════════════════════════════════════════════
  // Subscription status mapping
  // ══════════════════════════════════════════════════════

  // Test: mapSubscriptionStatus maps every known Stripe status
  // Category: Happy Path
  // What it proves: Known Stripe statuses round-trip to our DB enum values
  // Risk if missing: A known status could fall through to the wrong DB value
  it('maps every known Stripe subscription status', () => {
    const { client } = makeClient()
    const cases: [string, string][] = [
      ['active', 'active'],
      ['trialing', 'trialing'],
      ['past_due', 'past_due'],
      ['canceled', 'canceled'],
      ['unpaid', 'unpaid'],
      ['incomplete', 'incomplete'],
      ['incomplete_expired', 'incomplete_expired'],
      ['paused', 'paused'],
    ]
    for (const [input, expected] of cases) {
      expect(client.mapSubscriptionStatus(input as any)).toBe(expected)
    }
  })

  // Test: mapSubscriptionStatus falls back to incomplete for unknown statuses
  // Category: Unhappy Path
  // What it proves: A new/unexpected status maps to a safe default
  // Risk if missing: An unknown status could be mis-stored without a fallback
  it('falls back to incomplete for an unknown status', () => {
    const { client } = makeClient()
    expect(client.mapSubscriptionStatus('totally_new' as any)).toBe('incomplete')
  })

  // ══════════════════════════════════════════════════════
  // Webhook verification
  // ══════════════════════════════════════════════════════

  // Test: constructWebhookEvent returns null when the signature is invalid
  // Category: Unhappy Path
  // What it proves: A bad signature is caught and surfaced as null, not thrown
  // Risk if missing: An invalid signature could crash webhook handling
  it('returns null when webhook signature verification fails', () => {
    const { client } = makeClient()

    const event = client.constructWebhookEvent(
      '{"type":"checkout.session.completed"}',
      't=1,v1=0000000000000000000000000000000000000000000000000000',
      'whsec_test',
    )

    expect(event).toBeNull()
  })

  // ══════════════════════════════════════════════════════
  // Customer management
  // ══════════════════════════════════════════════════════

  // Test: getOrCreateCustomer returns the stored customer without calling Stripe
  // Category: Happy Path
  // What it proves: An existing mapping short-circuits the creation flow
  // Risk if missing: Duplicate Stripe customers would be created on every request
  it('returns an existing customer mapping without creating a new one', async () => {
    const { client, mockInsert } = makeClient({
      data: { stripe_customer_id: 'cus_existing' },
      error: null,
    })

    const id = await client.getOrCreateCustomer('tenant_001')

    expect(id).toBe('cus_existing')
    expect(mockInsert).not.toHaveBeenCalled()
  })

  // Test: getOrCreateCustomer creates and persists a new customer
  // Category: Happy Path
  // What it proves: A missing mapping creates a Stripe customer and stores the id
  // Risk if missing: New tenants would have no Stripe customer record
  it('creates a Stripe customer and persists the mapping', async () => {
    const { client, supabase, mockInsert } = makeClient()

    const raw = client.raw
    vi.spyOn(raw.customers as any, 'create').mockResolvedValue({ id: 'cus_new' })

    const id = await client.getOrCreateCustomer('tenant_002', 'a@example.com', 'Acme')

    expect(id).toBe('cus_new')
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant_002',
        stripe_customer_id: 'cus_new',
      }),
    )
    expect(supabase.from).toHaveBeenCalledWith('stripe_customers')
  })

  // ══════════════════════════════════════════════════════
  // Billing portal
  // ══════════════════════════════════════════════════════

  // Test: createBillingPortalSession throws when no customer exists
  // Category: Unhappy Path
  // What it proves: A tenant without a Stripe customer gets a clear error
  // Risk if missing: Portal access would be attempted for a non-existent customer
  it('throws when no Stripe customer exists for the tenant', async () => {
    const { client } = makeClient()

    await expect(
      client.createBillingPortalSession({
        tenantId: 'tenant_003',
        returnUrl: 'https://example.com',
      }),
    ).rejects.toThrow('No Stripe customer found for this tenant')
  })

  // ══════════════════════════════════════════════════════
  // Raw client access
  // ══════════════════════════════════════════════════════

  // Test: raw exposes the underlying Stripe client
  // Category: Happy Path
  // What it proves: Advanced operations can reach the raw client via the getter
  // Risk if missing: Consumers relying on raw access would be blocked
  it('exposes the underlying Stripe client via raw', () => {
    const { client } = makeClient()
    expect(client.raw).toBeDefined()
    // Same instance is reused across accesses (lazily-initialised once).
    expect(client.raw).toBe(client.raw)
  })
})
