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

export async function handleStripeWebhook(req: Request): Promise<Response> {
  const sig = req.headers.get('stripe-signature')
  if (!sig) return new Response('Missing signature', { status: 400 })

  const body = await req.text()
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(body, sig, webhookSecret)
  } catch {
    return new Response('Invalid signature', { status: 400 })
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      // event.data.object is Stripe.Checkout.Session — activate the subscription
      // for the tenant (e.g. set their plan to active in your database)
      break
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      // event.data.object is Stripe.Subscription — sync subscription status
      break
    }
  }

  return new Response('OK', { status: 200 })
}
