import Stripe from 'stripe'

let stripe: Stripe | null = null

function getStripe(): Stripe {
  if (!stripe) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2025-02-24.acacia',
    })
  }
  return stripe
}

interface CreateCheckoutParams {
  tenantId: string
  priceId: string
  interval: 'month' | 'year'
  successUrl: string
  cancelUrl: string
}

export async function createCheckoutSession(params: CreateCheckoutParams) {
  const stripe = getStripe()

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: params.priceId, quantity: 1 }],
    client_reference_id: params.tenantId,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    subscription_data: {
      metadata: { tenant_id: params.tenantId },
    },
  })

  return { url: session.url }
}

interface CreatePortalParams {
  tenantId: string
  returnUrl: string
}

export async function createBillingPortalSession(params: CreatePortalParams) {
  const stripe = getStripe()
  const { getCustomerId } = await import('../lib/billing.js')
  const customerId = await getCustomerId(params.tenantId)

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: params.returnUrl,
  })

  return { url: session.url }
}
