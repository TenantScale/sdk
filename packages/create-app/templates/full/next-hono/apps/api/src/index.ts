import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { meRoutes } from './routes/me.js'
import { apiKeyRoutes } from './routes/api-keys.js'
import { teamRoutes } from './routes/team.js'
import { auditRoutes } from './routes/audit.js'
import { webhookRoutes } from './routes/webhooks.js'
import { billingRoutes } from './routes/billing.js'
import { handleStripeWebhook } from './routes/stripe-webhook.js'

const app = new Hono()

app.use(
  '*',
  cors({
    // Reflect the request origin so credentialed requests work in the browser
    // (origin: '*' + credentials: true is rejected by browsers).
    origin: true,
    credentials: true,
  }),
)

app.route('/v1/portal', meRoutes)
app.route('/v1/portal', apiKeyRoutes)
app.route('/v1/portal', teamRoutes)
app.route('/v1/portal', auditRoutes)
app.route('/v1/portal', webhookRoutes)
app.route('/v1/portal', billingRoutes)

// Stripe webhook — verify signature and process subscription events
app.post('/webhooks/stripe', (c) => handleStripeWebhook(c.req.raw))

app.get('/health', (c) => c.json({ status: 'ok' }))

const port = parseInt(process.env.PORT || '3001', 10)
console.log(JSON.stringify({ level: 'info', msg: `API server running on http://localhost:${port}` }))

serve({ fetch: app.fetch, port })
