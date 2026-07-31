import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { TenantScale } from '@tenantscale/sdk'

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

// ── TenantScale SDK ──
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in your .env file.',
  )
}

const ts = new TenantScale({
  supabaseUrl,
  supabaseKey,
})

// ── Health check ──
app.get('/health', (c) => c.json({ status: 'ok', version: '0.1.0' }))

// ── Example tenant-scoped route ──
app.get('/v1/me', async (c) => {
  const apiKey = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!apiKey) return c.json({ error: 'Missing API key' }, 401)

  const key = await ts.validateApiKey(apiKey)
  if (!key) return c.json({ error: 'Invalid API key' }, 401)

  return c.json({ tenantId: key.tenant_id })
})

const port = parseInt(process.env.PORT || '3001', 10)
console.log(JSON.stringify({ level: 'info', msg: `API server running on http://localhost:${port}` }))

serve({ fetch: app.fetch, port })
