// ──────────────────────────────────────────────────────
// Session — Supabase JWT session validation
// Framework-agnostic: returns values, doesn't touch request/response
// ──────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PortalSessionInfo } from './types.js'
import { AuthenticationError, AuthorizationError } from './types.js'

export interface ValidateSessionOptions {
  /** When true, super_admins without tenant memberships are allowed through */
  allowSuperAdminWithoutTenant?: boolean
}

/**
 * Validate a Supabase session JWT and resolve the user's tenant membership.
 *
 * @param supabase - Supabase admin client
 * @param jwt - Raw JWT token (without 'Bearer ' prefix)
 * @param options - Optional configuration
 * @returns Resolved portal session info
 * @throws AuthenticationError if the JWT is invalid/expired
 * @throws AuthorizationError if the user has no tenant membership and is not a super_admin
 */
export async function validateSession(
  supabase: SupabaseClient,
  jwt: string,
  options: ValidateSessionOptions = {},
): Promise<PortalSessionInfo> {
  if (!jwt) {
    throw new AuthenticationError('Empty token')
  }

  // Validate the JWT with Supabase Auth
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(jwt)

  if (authError || !user) {
    throw new AuthenticationError('Invalid or expired session')
  }

  // Check if user is a platform super_admin
  const { data: adminRecord } = await supabase
    .from('platform_admins')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  const isSuperAdmin = !!adminRecord

  // Look up the user's tenant membership (optional for super_admins)
  const { data: membership } = await supabase
    .from('tenant_users')
    .select('id, role, tenant:tenants!inner(id, name, slug)')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership && !isSuperAdmin) {
    throw new AuthorizationError(
      'No tenant membership found. Ask your admin to add you to a tenant.',
      'NO_TENANT_MEMBERSHIP',
    )
  }

  if (membership) {
    const tenant = membership.tenant as unknown as { id: string; name: string; slug: string }
    return {
      user_id: user.id,
      email: user.email ?? '',
      tenant_id: tenant.id,
      tenant_slug: tenant.slug,
      tenant_name: tenant.name,
      role: membership.role,
      membership_id: membership.id,
      is_super_admin: isSuperAdmin,
    }
  }

  // Super_admin without a tenant membership
  return {
    user_id: user.id,
    email: user.email ?? '',
    tenant_id: null,
    tenant_slug: null,
    tenant_name: null,
    role: null,
    membership_id: null,
    is_super_admin: true,
  }
}

/**
 * Assert that a portal session has at least one of the required roles.
 * Throws AuthorizationError if not.
 */
export function requirePortalRole(session: PortalSessionInfo, ...roles: string[]): void {
  if (!session.role || !roles.includes(session.role)) {
    throw new AuthorizationError(
      `This endpoint requires one of these roles: ${roles.join(', ')}`,
      'MISSING_ROLE',
    )
  }
}

/**
 * Assert that a portal session is a super_admin.
 * Throws AuthorizationError if not.
 */
export function requireSuperAdmin(session: PortalSessionInfo): void {
  if (!session.is_super_admin) {
    throw new AuthorizationError('Super admin access required', 'NOT_SUPER_ADMIN')
  }
}
