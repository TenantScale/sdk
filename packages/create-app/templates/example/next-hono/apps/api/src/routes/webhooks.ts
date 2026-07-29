import { randomBytes } from 'node:crypto'
import { Hono } from 'hono'
import { supabase } from '../db.js'

export const webhookRoutes = new Hono()

async function resolveTenant(authHeader: string): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) return null
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.slice(7))
  if (error || !user) return null
  const { data: membership } = await supabase
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .maybeSingle()
  return membership?.tenant_id ?? null
}

// GET /v1/portal/webhooks
webhookRoutes.get('/webhooks', async (c) => {
  const tenantId = await resolveTenant(c.req.header('Authorization') || '')
  if (!tenantId) return c.json({ error: 'Unauthorized' }, 401)

  const { data, error } = await supabase
    .from('webhooks')
    .select('id, url, events, description, is_active, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) return c.json({ error: error.message }, 500)
  return c.json({ data, meta: { page: 1, limit: 50, total: data.length, total_pages: 1 } })
})

// POST /v1/portal/webhooks
webhookRoutes.post('/webhooks', async (c) => {
  const tenantId = await resolveTenant(c.req.header('Authorization') || '')
  if (!tenantId) return c.json({ error: 'Unauthorized' }, 401)

  const body = await c.req.json()

  // Input validation
  try {
    new URL(body.url)
  } catch {
    return c.json({ error: 'Invalid webhook URL' }, 400)
  }
  if (!Array.isArray(body.events) || body.events.length === 0) {
    return c.json({ error: 'events must be a non-empty array of strings' }, 400)
  }
  if (body.description && typeof body.description === 'string' && body.description.length > 500) {
    return c.json({ error: 'description must be at most 500 characters' }, 400)
  }

  const { data, error } = await supabase
    .from('webhooks')
    .insert({
      tenant_id: tenantId,
      url: body.url,
      events: body.events,
      description: body.description || '',
      secret: randomBytes(32).toString('hex'),
    })
    .select('id, url, events, description, is_active, created_at')
    .single()

  if (error) return c.json({ error: error.message }, 500)
  return c.json(data, 201)
})

// PATCH /v1/portal/webhooks/:id
webhookRoutes.patch('/webhooks/:id', async (c) => {
  const tenantId = await resolveTenant(c.req.header('Authorization') || '')
  if (!tenantId) return c.json({ error: 'Unauthorized' }, 401)

  const id = c.req.param('id')
  const body = await c.req.json()
  const { data, error } = await supabase
    .from('webhooks')
    .update(body)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('id, url, events, description, is_active, created_at')
    .single()

  if (error) return c.json({ error: error.message }, 500)
  return c.json(data)
})

// DELETE /v1/portal/webhooks/:id
webhookRoutes.delete('/webhooks/:id', async (c) => {
  const tenantId = await resolveTenant(c.req.header('Authorization') || '')
  if (!tenantId) return c.json({ error: 'Unauthorized' }, 401)

  const id = c.req.param('id')
  const { error } = await supabase
    .from('webhooks')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)

  if (error) return c.json({ error: error.message }, 500)
  return c.json({ success: true })
})

// GET /v1/portal/webhooks/:id/deliveries
webhookRoutes.get('/webhooks/:id/deliveries', async (c) => {
  const tenantId = await resolveTenant(c.req.header('Authorization') || '')
  if (!tenantId) return c.json({ error: 'Unauthorized' }, 401)

  const id = c.req.param('id')
  const page = parseInt(c.req.query('page') || '1', 10)
  const limit = parseInt(c.req.query('limit') || '50', 10)
  const offset = (page - 1) * limit

  const { data, error, count } = await supabase
    .from('webhook_deliveries')
    .select('*', { count: 'exact' })
    .eq('webhook_id', id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return c.json({ error: error.message }, 500)
  return c.json({
    data,
    meta: { page, limit, total: count ?? 0, total_pages: Math.ceil((count ?? 0) / limit) },
  })
})
