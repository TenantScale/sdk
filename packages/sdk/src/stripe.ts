// ──────────────────────────────────────────────────────
// Stripe — shared client and helpers
// Framework-agnostic: takes supabase as parameter
// ──────────────────────────────────────────────────────

import Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CreateCheckoutOptions,
  CreatePortalOptions,
  PlanPriceMapping,
  Logger,
} from './types.js'

const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_MAX_RETRIES = 2

/**
 * Stripe integration helpers for TenantScale.
 * Handles customer creation, checkout sessions, billing portal, and webhooks.
 */
export class StripeClient {
  private _client: Stripe | null = null
  private logger: Logger
  private secretKey: string
  private apiVersion?: string

  constructor(
    private supabase: SupabaseClient,
    options: {
      secretKey: string
      apiVersion?: string
      logger?: Logger
    },
  ) {
    this.secretKey = options.secretKey
    this.apiVersion = options.apiVersion
    this.logger = options.logger ?? console
  }

  private get client(): Stripe {
    if (this._client) return this._client
    this._client = new Stripe(this.secretKey, {
      typescript: true,
      maxNetworkRetries: DEFAULT_MAX_RETRIES,
      timeout: DEFAULT_TIMEOUT_MS,
      apiVersion: this.apiVersion as any,
    })
    return this._client
  }

  // ── Price ID Configuration ──

  /**
   * Configure price ID mappings from environment variables or other sources.
   * Map plan IDs to their monthly and yearly Stripe price IDs.
   *
   * Example:
   * ```ts
   * stripeClient.setPriceMapping('hobby', {
   *   monthly: process.env.STRIPE_PRICE_HOBBY_MONTH,
   *   yearly: process.env.STRIPE_PRICE_HOBBY_YEAR,
   * })
   * ```
   */
  private priceMapping: Record<string, PlanPriceMapping> = {}

  setPriceMapping(planId: string, prices: PlanPriceMapping): void {
    this.priceMapping[planId] = prices
  }

  setPriceMappings(mappings: Record<string, PlanPriceMapping>): void {
    Object.assign(this.priceMapping, mappings)
  }

  /**
   * Get the Stripe price ID for a given plan and billing interval.
   */
  getPriceId(planId: string, interval: 'month' | 'year'): string | undefined {
    const mapping = this.priceMapping[planId]
    if (!mapping) return undefined
    return interval === 'month' ? mapping.monthly : mapping.yearly
  }

  /**
   * Resolve a Stripe price ID back to its plan ID and billing interval.
   */
  resolvePlanFromPrice(priceId: string): { planId: string; interval: 'month' | 'year' } | null {
    for (const [planId, prices] of Object.entries(this.priceMapping)) {
      if (prices.monthly === priceId) return { planId, interval: 'month' }
      if (prices.yearly === priceId) return { planId, interval: 'year' }
    }
    return null
  }

  // ── Customer Management ──

  /**
   * Get or create a Stripe Customer for a tenant.
   * Looks up an existing mapping first to avoid duplicates.
   */
  async getOrCreateCustomer(tenantId: string, email?: string, name?: string): Promise<string> {
    // Check existing mapping
    const { data: existing } = await this.supabase
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (existing?.stripe_customer_id) {
      return existing.stripe_customer_id
    }

    // Create customer in Stripe
    const customer = await this.client.customers.create({
      email,
      name,
      metadata: { tenant_id: tenantId },
    })

    // Store mapping
    const { error: insertError } = await this.supabase.from('stripe_customers').insert({
      tenant_id: tenantId,
      stripe_customer_id: customer.id,
    })

    if (insertError) {
      this.logger.warn(
        { tenantId, error: insertError },
        'Failed to persist Stripe customer mapping',
      )
    }

    this.logger.info({ tenantId, stripeCustomerId: customer.id }, 'Created Stripe customer')
    return customer.id
  }

  // ── Checkout Sessions ──

  /**
   * Create a Stripe Checkout Session for a tenant subscription.
   * Automatically resolves or creates the Stripe Customer.
   */
  async createCheckoutSession(opts: CreateCheckoutOptions) {
    const customerId = await this.getOrCreateCustomer(
      opts.tenantId,
      opts.customerEmail,
      opts.tenantName,
    )

    const session = await this.client.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [
        {
          price: opts.priceId,
          quantity: 1,
        },
      ],
      metadata: {
        tenant_id: opts.tenantId,
        billing_interval: opts.billingInterval,
        ...opts.metadata,
      },
      success_url: opts.successUrl,
      cancel_url: opts.cancelUrl,
      subscription_data: {
        metadata: {
          tenant_id: opts.tenantId,
          billing_interval: opts.billingInterval,
        },
      },
    })

    return session
  }

  // ── Billing Portal ──

  /**
   * Create a Stripe Customer Portal session so the customer can
   * manage their subscription, payment methods, and invoices.
   */
  async createBillingPortalSession(opts: CreatePortalOptions) {
    const { data: customer } = await this.supabase
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('tenant_id', opts.tenantId)
      .maybeSingle()

    if (!customer?.stripe_customer_id) {
      throw new Error('No Stripe customer found for this tenant')
    }

    const session = await this.client.billingPortal.sessions.create({
      customer: customer.stripe_customer_id,
      return_url: opts.returnUrl,
    })

    return session
  }

  // ── Webhook Verification ──

  /**
   * Construct a verified Stripe webhook event from the raw request body
   * and signature header. Returns null if verification fails or secret not configured.
   */
  constructWebhookEvent(
    body: string | Buffer,
    signature: string,
    secret: string,
  ): Stripe.Event | null {
    try {
      return this.client.webhooks.constructEvent(body, signature, secret)
    } catch (err) {
      this.logger.warn({ err }, '[Stripe] Webhook signature verification failed')
      return null
    }
  }

  // ── Subscription Status Mapping ──

  /**
   * Map a Stripe subscription status to our DB enum.
   */
  mapSubscriptionStatus(stripeStatus: Stripe.Subscription.Status): string {
    switch (stripeStatus) {
      case 'active':
        return 'active'
      case 'past_due':
        return 'past_due'
      case 'canceled':
        return 'canceled'
      case 'unpaid':
        return 'unpaid'
      case 'incomplete':
        return 'incomplete'
      case 'incomplete_expired':
        return 'incomplete_expired'
      case 'trialing':
        return 'trialing'
      case 'paused':
        return 'paused'
      default:
        return 'incomplete'
    }
  }

  /**
   * Access the raw Stripe client for advanced operations.
   */
  get raw(): Stripe {
    return this.client
  }
}
