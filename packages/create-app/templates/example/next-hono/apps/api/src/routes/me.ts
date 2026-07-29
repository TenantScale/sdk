import { Hono } from 'hono'
import { supabase } from '../db.js'

export const meRoutes = new Hono()

// GET /v1/portal/me — Current user + tenant context
meRoutes.get('/me', async (c) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const { data: { user }, error } = await supabase.auth.getUser(authHeader.slice(7))
  if (error || !user) {
    return c.json({ error: 'Invalid session' }, 401)
  }

  // Find user's primary tenant
  const { data: membership } = await supabase
    .from('tenant_users')
    .select('id, role, joined_at, tenant:tenants(*)')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership) {
    return c.json({ user: { id: user.id, email: user.email }, tenant: null, plan: null, deployment: { mode: 'self_hosted' } })
  }

  const tenant = Array.isArray(membership.tenant) ? membership.tenant[0] : membership.tenant

  const { data: plan } = await supabase
    .from('plans')
    .select('*')
    .eq('id', tenant.plan_id)
    .single()

  return c.json({
    user: { id: user.id, email: user.email },
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      role: membership.role,
      is_super_admin: false,
    },
    plan: {
      id: plan.id,
      name: plan.name,
      price_monthly: plan.price_monthly,
      features: plan.features ?? {},
      limits: plan.limits ?? {},
    },
    deployment: { mode: 'self_hosted' },
  })
})
