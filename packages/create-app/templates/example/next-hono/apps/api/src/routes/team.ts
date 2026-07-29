import { Hono } from 'hono'
import { supabase } from '../db.js'

export const teamRoutes = new Hono()

async function resolveTenant(authHeader: string): Promise<{ tenantId: string; userId: string } | null> {
  if (!authHeader?.startsWith('Bearer ')) return null
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.slice(7))
  if (error || !user) return null
  const { data: membership } = await supabase
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) return null
  return { tenantId: membership.tenant_id, userId: user.id }
}

// GET /v1/portal/team
teamRoutes.get('/team', async (c) => {
  const ctx = await resolveTenant(c.req.header('Authorization') || '')
  if (!ctx) return c.json({ error: 'Unauthorized' }, 401)

  const { data, error } = await supabase
    .from('tenant_users')
    .select('id, user_id, email, role, joined_at')
    .eq('tenant_id', ctx.tenantId)
    .order('joined_at', { ascending: true })

  if (error) return c.json({ error: error.message }, 500)
  return c.json({ data, meta: { page: 1, limit: 50, total: data.length, total_pages: 1 } })
})

// POST /v1/portal/team/invite
teamRoutes.post('/team/invite', async (c) => {
  const ctx = await resolveTenant(c.req.header('Authorization') || '')
  if (!ctx) return c.json({ error: 'Unauthorized' }, 401)

  const body = await c.req.json()
  const { data, error } = await supabase
    .from('tenant_users')
    .insert({
      tenant_id: ctx.tenantId,
      user_id: body.user_id || crypto.randomUUID(),
      email: body.email,
      role: body.role || 'member',
    })
    .select('id, user_id, email, role, joined_at')
    .single()

  if (error) return c.json({ error: error.message }, 500)
  return c.json(data, 201)
})

// PATCH /v1/portal/team/:id
teamRoutes.patch('/team/:id', async (c) => {
  const ctx = await resolveTenant(c.req.header('Authorization') || '')
  if (!ctx) return c.json({ error: 'Unauthorized' }, 401)

  const id = c.req.param('id')
  const body = await c.req.json()
  const { error } = await supabase
    .from('tenant_users')
    .update({ role: body.role })
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)

  if (error) return c.json({ error: error.message }, 500)
  return c.json({ success: true })
})

// DELETE /v1/portal/team/:id
teamRoutes.delete('/team/:id', async (c) => {
  const ctx = await resolveTenant(c.req.header('Authorization') || '')
  if (!ctx) return c.json({ error: 'Unauthorized' }, 401)

  const id = c.req.param('id')
  const { error } = await supabase
    .from('tenant_users')
    .delete()
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)

  if (error) return c.json({ error: error.message }, 500)
  return c.json({ success: true })
})
