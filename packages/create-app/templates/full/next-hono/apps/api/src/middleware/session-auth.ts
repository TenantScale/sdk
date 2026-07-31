import type { Context, Next } from 'hono'
import { supabase } from '../db.js'

/**
 * Portal session attached to the Hono context by requirePortalSession.
 */
export interface PortalSession {
  user_id: string
  tenant_id: string
  role: string
  plan_id: string | null
}

declare module 'hono' {
  interface ContextVariableMap {
    portalSession: PortalSession
  }
}

/**
 * Require a valid Portal session (Bearer token) and attach the resolved
 * user + tenant context to the request.
 */
export async function requirePortalSession(c: Context, next: Next): Promise<Response | void> {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(authHeader.slice(7))
  if (error || !user) {
    return c.json({ error: 'Invalid session' }, 401)
  }

  // Resolve the user's primary tenant membership
  const { data: membership } = await supabase
    .from('tenant_users')
    .select('role, tenant:tenants(*)')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership) {
    return c.json({ error: 'No tenant membership' }, 403)
  }

  const tenant = Array.isArray(membership.tenant) ? membership.tenant[0] : membership.tenant

  c.set('portalSession', {
    user_id: user.id,
    tenant_id: tenant.id,
    role: membership.role,
    plan_id: tenant.plan_id ?? null,
  })

  await next()
}

/**
 * Require a specific role (e.g. 'owner') on top of requirePortalSession.
 */
export function requirePortalRole(role: string) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const session = c.get('portalSession')
    if (session.role !== role) {
      return c.json({ error: 'Insufficient permissions' }, 403)
    }
    await next()
  }
}
