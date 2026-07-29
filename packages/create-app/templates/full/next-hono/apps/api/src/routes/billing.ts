import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { requirePortalSession, requirePortalRole } from '../middleware/session-auth.js'
import { createCheckoutSession, createBillingPortalSession } from '../lib/stripe.js'

export const billingRoutes = new Hono()

const createCheckoutSchema = z.object({
  plan_id: z.enum(['hobby', 'pro', 'scale']),
  billing_interval: z.enum(['month', 'year']).default('month'),
})

// POST /portal/create-checkout-session
billingRoutes.post(
  '/portal/create-checkout-session',
  requirePortalSession,
  requirePortalRole('owner'),
  zValidator('json', createCheckoutSchema),
  async (c) => {
    const session = c.get('portalSession')
    const body = c.req.valid('json')

    const checkout = await createCheckoutSession({
      tenantId: session.tenant_id,
      priceId: body.plan_id,
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
