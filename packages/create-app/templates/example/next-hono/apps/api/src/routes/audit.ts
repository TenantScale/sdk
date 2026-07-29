import { Hono } from 'hono'
import { supabase } from '../db.js'

export const auditRoutes = new Hono()

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

// GET /v1/portal/audit?page=1&limit=50
auditRoutes.get('/audit', async (c) => {
  const tenantId = await resolveTenant(c.req.header('Authorization') || '')
  if (!tenantId) return c.json({ error: 'Unauthorized' }, 401)

  const page = parseInt(c.req.query('page') || '1', 10)
  const limit = parseInt(c.req.query('limit') || '50', 10)
  const offset = (page - 1) * limit

  const { data, error, count } = await supabase
    .from('audit_events')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return c.json({ error: error.message }, 500)
  return c.json({
    data,
    meta: { page, limit, total: count ?? 0, total_pages: Math.ceil((count ?? 0) / limit) },
  })
})
