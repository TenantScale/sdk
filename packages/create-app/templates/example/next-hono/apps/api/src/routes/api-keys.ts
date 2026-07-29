import { Hono } from 'hono'
import { supabase } from '../db.js'
import { createHash, randomBytes } from 'crypto'

export const apiKeyRoutes = new Hono()

// Helper: resolve tenant_id from auth
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

// GET /v1/portal/api-keys
apiKeyRoutes.get('/api-keys', async (c) => {
  const tenantId = await resolveTenant(c.req.header('Authorization') || '')
  if (!tenantId) return c.json({ error: 'Unauthorized' }, 401)

  const { data, error } = await supabase
    .from('api_keys')
    .select('id, label, key_prefix, scopes, is_active, expires_at, last_used_at, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) return c.json({ error: error.message }, 500)
  return c.json({ data, meta: { page: 1, limit: 50, total: data.length, total_pages: 1 } })
})

// POST /v1/portal/api-keys
apiKeyRoutes.post('/api-keys', async (c) => {
  const tenantId = await resolveTenant(c.req.header('Authorization') || '')
  if (!tenantId) return c.json({ error: 'Unauthorized' }, 401)

  const body = await c.req.json()
  const rawKey = 'tk_' + randomBytes(32).toString('hex')
  const keyHash = createHash('sha256').update(rawKey).digest('hex')
  const keyPrefix = rawKey.slice(0, 8)

  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      tenant_id: tenantId,
      label: body.label || 'Default',
      key_hash: keyHash,
      key_prefix: keyPrefix,
      scopes: body.scopes || ['read'],
    })
    .select('id, label, key_prefix, scopes, is_active, expires_at, last_used_at, created_at')
    .single()

  if (error) return c.json({ error: error.message }, 500)
  return c.json({ ...data, raw_key: rawKey }, 201)
})

// DELETE /v1/portal/api-keys/:id
apiKeyRoutes.delete('/api-keys/:id', async (c) => {
  const tenantId = await resolveTenant(c.req.header('Authorization') || '')
  if (!tenantId) return c.json({ error: 'Unauthorized' }, 401)

  const id = c.req.param('id')
  const { error } = await supabase
    .from('api_keys')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)

  if (error) return c.json({ error: error.message }, 500)
  return c.json({ success: true })
})
