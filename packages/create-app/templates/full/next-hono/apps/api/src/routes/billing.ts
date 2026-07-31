import { Hono } from 'hono'
import { z } from 'zod'
import { requirePortalSession, requirePortalRole } from '../middleware/session-auth.js'
import { createCheckoutSession, createBillingPortalSession } from './stripe.js'

export const billingRoutes = new Hono()

const createCheckoutSchema = z.object({
  price_id: z.string().startsWith('price_'),
  billing_interval: z.enum(['month', 'year']).default('month'),
})

// POST /portal/create-checkout-session
billingRoutes.post(
  '/portal/create-checkout-session',
  requirePortalSession,
  requirePortalRole('owner'),
  async (c) => {
    const session = c.get('portalSession')
    const parsed = createCheckoutSchema.safeParse(await c.req.json())
    if (!parsed.success) {
      return c.json({ error: 'Invalid request body', details: parsed.error.flatten() }, 400)
    }
    const body = parsed.data

    const checkout = await createCheckoutSession({
      tenantId: session.tenant_id,
      priceId: body.price_id,
      interval: body.billing_interval,
      successUrl: `${process.env.APP_URL}/subscription?success=true`,
      cancelUrl: `${process.env.APP_URL}/subscription?canceled=true`,
    })

    return c.json({ url: checkout.url })
  },
)

// POST /portal/billing-portal
billingRoutes.post(
  '/portal/billing-portal',
  requirePortalSession,
  requirePortalRole('owner'),
  async (c) => {
    const session = c.get('portalSession')
    const portal = await createBillingPortalSession({
      tenantId: session.tenant_id,
      returnUrl: `${process.env.APP_URL}/settings/billing`,
    })

    return c.json({ url: portal.url })
  },
)

// GET /portal/subscription
billingRoutes.get('/portal/subscription', requirePortalSession, async (c) => {
  const session = c.get('portalSession')
  // Fetch subscription from database
  return c.json({ plan: session.plan_id || 'hobby' })
})