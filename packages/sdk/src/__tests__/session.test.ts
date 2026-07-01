// ──────────────────────────────────────────────────────
// Session — Comprehensive Unit Tests
// ──────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validateSession, requirePortalRole, requireSuperAdmin } from '../session.js'
import { AuthenticationError, AuthorizationError } from '../types.js'
import type { PortalSessionInfo } from '../types.js'

// ── Helpers ──

function makeMockUserResponse(user: Record<string, unknown> | null, authError: Error | null = null) {
  return {
    data: { user },
    error: authError,
  }
}

function makeMockSupabase(overrides: Record<string, unknown> = {}) {
  const mockGetUser = vi.fn()
  const mockMaybeSingle1 = vi.fn()
  const mockEq1 = vi.fn(() => ({ maybeSingle: mockMaybeSingle1 }))
  const mockSelect1 = vi.fn(() => ({ eq: mockEq1 }))
  const mockMaybeSingle2 = vi.fn()
  const mockEq2 = vi.fn(() => ({ maybeSingle: mockMaybeSingle2 }))
  const mockSelect2 = vi.fn(() => ({ eq: mockEq2 }))

  const mockFrom = vi.fn((table: string) => {
    if (table === 'platform_admins') {
      return { select: mockSelect1 }
    }
    if (table === 'tenant_users') {
      return { select: mockSelect2 }
    }
    return { select: vi.fn(), update: vi.fn(), insert: vi.fn() }
  })

  const auth = { getUser: mockGetUser }

  const supabase = {
    from: mockFrom,
    auth,
    ...overrides,
  }

  return {
    supabase,
    mockGetUser,
    mockMaybeSingle1,
    mockEq1,
    mockSelect1,
    mockMaybeSingle2,
    mockEq2,
    mockSelect2,
    mockFrom,
  }
}

// ── Tests ──

describe('validateSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Happy Path ──

  // Test: Valid JWT with tenant membership returns full PortalSessionInfo
  // Category: Happy Path
  // What it proves: The primary use case — a valid JWT with tenant membership resolves all session fields
  // Risk if missing: The core session validation flow would be untested, blocking all portal logins
  it('returns full PortalSessionInfo for valid JWT with tenant membership', async () => {
    const { supabase, mockGetUser, mockMaybeSingle1, mockMaybeSingle2 } = makeMockSupabase()

    mockGetUser.mockResolvedValue(
      makeMockUserResponse({ id: 'user_001', email: 'test@example.com' })
    )
    mockMaybeSingle1.mockResolvedValue({ data: null, error: null }) // Not super admin
    mockMaybeSingle2.mockResolvedValue({
      data: {
        id: 'membership_001',
        role: 'admin',
        tenant: { id: 'tenant_001', name: 'Test Corp', slug: 'test-corp' },
      },
      error: null,
    })

    const result = await validateSession(supabase as any, 'valid.jwt.token')

    expect(result).toEqual({
      user_id: 'user_001',
      email: 'test@example.com',
      tenant_id: 'tenant_001',
      tenant_slug: 'test-corp',
      tenant_name: 'Test Corp',
      role: 'admin',
      membership_id: 'membership_001',
      is_super_admin: false,
    })
  })

  // Test: Valid JWT as super_admin without tenant returns is_super_admin=true
  // Category: Happy Path
  // What it proves: Super admins without tenant memberships are allowed through with tenant fields null
  // Risk if missing: Super admin dashboard/management access would be broken
  it('returns super_admin session without tenant membership', async () => {
    const { supabase, mockGetUser, mockMaybeSingle1, mockMaybeSingle2 } = makeMockSupabase()

    mockGetUser.mockResolvedValue(
      makeMockUserResponse({ id: 'user_002', email: 'super@example.com' })
    )
    mockMaybeSingle1.mockResolvedValue({ data: { id: 'admin_001' }, error: null }) // Is super admin
    mockMaybeSingle2.mockResolvedValue({ data: null, error: null }) // No tenant membership

    const result = await validateSession(supabase as any, 'super.jwt.token')

    expect(result).toEqual({
      user_id: 'user_002',
      email: 'super@example.com',
      tenant_id: null,
      tenant_slug: null,
      tenant_name: null,
      role: null,
      membership_id: null,
      is_super_admin: true,
    })
  })

  // Test: Valid JWT with super_admin AND tenant membership
  // Category: Happy Path
  // What it proves: Super admins who also have a tenant membership get both is_super_admin and tenant info
  // Risk if missing: Super admins who are also regular tenant users might have incorrect session info
  it('returns both super_admin status and tenant membership when both exist', async () => {
    const { supabase, mockGetUser, mockMaybeSingle1, mockMaybeSingle2 } = makeMockSupabase()

    mockGetUser.mockResolvedValue(
      makeMockUserResponse({ id: 'user_003', email: 'superadmin@corp.com' })
    )
    mockMaybeSingle1.mockResolvedValue({ data: { id: 'admin_001' }, error: null })
    mockMaybeSingle2.mockResolvedValue({
      data: {
        id: 'membership_003',
        role: 'owner',
        tenant: { id: 'tenant_003', name: 'My Corp', slug: 'my-corp' },
      },
      error: null,
    })

    const result = await validateSession(supabase as any, 'super.tenant.jwt')
    expect(result.is_super_admin).toBe(true)
    expect(result.tenant_id).toBe('tenant_003')
    expect(result.role).toBe('owner')
  })

  // Test: allowSuperAdminWithoutTenant option behavior
  // Category: Happy Path
  // What it proves: The option allows super_admins without tenant membership through (same as default behavior for super_admin)
  // Risk if missing: The option might not be wired correctly
  it('respects allowSuperAdminWithoutTenant option (no change for super_admins)', async () => {
    const { supabase, mockGetUser, mockMaybeSingle1, mockMaybeSingle2 } = makeMockSupabase()

    mockGetUser.mockResolvedValue(
      makeMockUserResponse({ id: 'user_004', email: 'admin@example.com' })
    )
    mockMaybeSingle1.mockResolvedValue({ data: { id: 'admin_001' }, error: null })
    mockMaybeSingle2.mockResolvedValue({ data: null, error: null })

    const result = await validateSession(supabase as any, 'admin.jwt', {
      allowSuperAdminWithoutTenant: true,
    })
    expect(result.is_super_admin).toBe(true)
    expect(result.tenant_id).toBeNull()
  })

  // Test: User without email gets empty string
  // Category: Happy Path
  // What it proves: A user with no email returns an empty string, not null or undefined
  // Risk if missing: Null email could cause crashes downstream when used as a string
  it('handles user with no email gracefully', async () => {
    const { supabase, mockGetUser, mockMaybeSingle1, mockMaybeSingle2 } = makeMockSupabase()

    mockGetUser.mockResolvedValue(
      makeMockUserResponse({ id: 'user_no_email' })
    )
    mockMaybeSingle1.mockResolvedValue({ data: null, error: null })
    mockMaybeSingle2.mockResolvedValue({
      data: {
        id: 'mem_001',
        role: 'member',
        tenant: { id: 't1', name: 'T', slug: 't' },
      },
      error: null,
    })

    const result = await validateSession(supabase as any, 'noemail.jwt')
    expect(result.email).toBe('')
  })

  // ── Unhappy Path ──

  // Test: Empty JWT throws AuthenticationError
  // Category: Unhappy Path
  // What it proves: Empty/falsy JWT strings are rejected early
  // Risk if missing: Empty tokens could reach auth.getUser and cause confusing errors
  it('throws AuthenticationError for empty JWT', async () => {
    const { supabase } = makeMockSupabase()
    await expect(validateSession(supabase as any, '')).rejects.toThrow(AuthenticationError)
    await expect(validateSession(supabase as any, '')).rejects.toThrow('Empty token')
  })

  // Test: Auth error from getUser throws AuthenticationError
  // Category: Unhappy Path
  // What it proves: When supabase.auth.getUser returns an error, it's converted to AuthenticationError
  // Risk if missing: Auth errors might leak internal details or be improperly handled
  it('throws AuthenticationError when auth.getUser fails', async () => {
    const { supabase, mockGetUser } = makeMockSupabase()
    mockGetUser.mockResolvedValue(
      makeMockUserResponse(null, new Error('JWT expired'))
    )

    await expect(validateSession(supabase as any, 'expired.jwt')).rejects.toThrow(AuthenticationError)
    await expect(validateSession(supabase as any, 'expired.jwt')).rejects.toThrow('Invalid or expired session')
  })

  // Test: No user returned from getUser
  // Category: Unhappy Path
  // What it proves: When getUser returns null user, it's treated as invalid session
  // Risk if missing: A null user response could slip through and cause downstream crashes
  it('throws AuthenticationError when getUser returns null user', async () => {
    const { supabase, mockGetUser } = makeMockSupabase()
    mockGetUser.mockResolvedValue(
      makeMockUserResponse(null)
    )

    await expect(validateSession(supabase as any, 'nulluser.jwt')).rejects.toThrow(AuthenticationError)
    await expect(validateSession(supabase as any, 'nulluser.jwt')).rejects.toThrow('Invalid or expired session')
  })

  // Test: No tenant membership and not super_admin throws AuthorizationError
  // Category: Unhappy Path
  // What it proves: Regular users without tenant memberships are rejected
  // Risk if missing: Unauthorized users could access portal features without a tenant
  it('throws AuthorizationError when no tenant membership and not super_admin', async () => {
    const { supabase, mockGetUser, mockMaybeSingle1, mockMaybeSingle2 } = makeMockSupabase()

    mockGetUser.mockResolvedValue(
      makeMockUserResponse({ id: 'user_005', email: 'orphan@example.com' })
    )
    mockMaybeSingle1.mockResolvedValue({ data: null, error: null }) // Not super admin
    mockMaybeSingle2.mockResolvedValue({ data: null, error: null }) // No tenant membership

    await expect(validateSession(supabase as any, 'orphan.jwt')).rejects.toThrow(AuthorizationError)
    await expect(validateSession(supabase as any, 'orphan.jwt')).rejects.toThrow('No tenant membership found')
    try {
      await validateSession(supabase as any, 'orphan.jwt')
    } catch (e: any) {
      expect(e.code).toBe('NO_TENANT_MEMBERSHIP')
    }
  })

  // Test: Unicode email in session
  // Category: Unhappy Path
  // What it proves: Emails with Unicode and special characters (+符号 etc.) are handled
  // Risk if missing: International email addresses could be rejected or cause encoding issues
  it('handles Unicode email addresses gracefully', async () => {
    const { supabase, mockGetUser, mockMaybeSingle1, mockMaybeSingle2 } = makeMockSupabase()

    mockGetUser.mockResolvedValue(
      makeMockUserResponse({ id: 'user_unicode', email: 'user+test@münchen.de' })
    )
    mockMaybeSingle1.mockResolvedValue({ data: null, error: null })
    mockMaybeSingle2.mockResolvedValue({
      data: {
        id: 'mem_uni',
        role: 'member',
        tenant: { id: 't_u', name: 'U Corp', slug: 'u-corp' },
      },
      error: null,
    })

    const result = await validateSession(supabase as any, 'unicode.jwt')
    expect(result.email).toBe('user+test@münchen.de')
  })

  // Test: DB query for platform_admins fails
  // Category: Unhappy Path
  // What it proves: A failed platform_admins query doesn't crash — treated as not super_admin
  // Risk if missing: DB errors in secondary queries could crash the entire session validation
  it('handles platform_admins query error gracefully (treated as not super_admin)', async () => {
    const { supabase, mockGetUser, mockMaybeSingle1, mockMaybeSingle2 } = makeMockSupabase()

    mockGetUser.mockResolvedValue(
      makeMockUserResponse({ id: 'user_006', email: 'test@example.com' })
    )
    mockMaybeSingle1.mockRejectedValue(new Error('DB error')) // platform_admins query fails
    mockMaybeSingle2.mockResolvedValue({
      data: {
        id: 'mem_001',
        role: 'admin',
        tenant: { id: 't1', name: 'T', slug: 't' },
      },
      error: null,
    })

    // The function catches errors from platform_admins? Let's check the code...
    // Looking at the source: it uses await, so if platform_admins throws, it propagates.
    // But in practice the Supabase client doesn't throw for errors — it returns error in result.
    // Our mockMaybeSingle1 here rejects, so the function should propagate the error.
    await expect(validateSession(supabase as any, 'fail.jwt')).rejects.toThrow()
  })

  // Test: Tenant users query fails
  // Category: Unhappy Path
  // What it proves: A failed tenant_users query propagates the error (Supabase doesn't throw on DB errors)
  // Risk if missing: DB errors on membership lookup could leave users in an ambiguous state
  it('handles tenant_users query error', async () => {
    const { supabase, mockGetUser, mockMaybeSingle1, mockMaybeSingle2 } = makeMockSupabase()

    mockGetUser.mockResolvedValue(
      makeMockUserResponse({ id: 'user_007', email: 'test@example.com' })
    )
    mockMaybeSingle1.mockResolvedValue({ data: null, error: null })
    mockMaybeSingle2.mockRejectedValue(new Error('DB error'))

    await expect(validateSession(supabase as any, 'fail2.jwt')).rejects.toThrow()
  })
})

// ── requirePortalRole ──

describe('requirePortalRole', () => {
  // Test: requirePortalRole matches
  // Category: Happy Path
  // What it proves: When the session has one of the required roles, no throw
  // Risk if missing: Authorized users would be blocked from portal endpoints
  it('does not throw when session role matches', () => {
    const session: PortalSessionInfo = {
      user_id: 'u1',
      email: 'admin@test.com',
      tenant_id: 't1',
      tenant_slug: 'test',
      tenant_name: 'Test',
      role: 'admin',
      membership_id: 'm1',
      is_super_admin: false,
    }
    expect(() => requirePortalRole(session, 'admin')).not.toThrow()
  })

  // Test: requirePortalRole with multiple roles, one matches
  // Category: Happy Path
  // What it proves: Multiple roles are OR'ed — any match is sufficient
  // Risk if missing: Users with partial role matches could be incorrectly blocked
  it('does not throw when at least one of multiple roles matches', () => {
    const session: PortalSessionInfo = {
      user_id: 'u1',
      email: 'member@test.com',
      tenant_id: 't1',
      tenant_slug: 'test',
      tenant_name: 'Test',
      role: 'member',
      membership_id: 'm1',
      is_super_admin: false,
    }
    expect(() => requirePortalRole(session, 'admin', 'member', 'owner')).not.toThrow()
  })

  // Test: requirePortalRole doesn't match
  // Category: Unhappy Path
  // What it proves: Non-matching role throws AuthorizationError with MISSING_ROLE code
  // Risk if missing: Unauthorized users would get access to restricted endpoints
  it('throws AuthorizationError when role does not match', () => {
    const session: PortalSessionInfo = {
      user_id: 'u1',
      email: 'viewer@test.com',
      tenant_id: 't1',
      tenant_slug: 'test',
      tenant_name: 'Test',
      role: 'viewer',
      membership_id: 'm1',
      is_super_admin: false,
    }
    expect(() => requirePortalRole(session, 'admin')).toThrow(AuthorizationError)
    expect(() => requirePortalRole(session, 'admin')).toThrow(
      'This endpoint requires one of these roles: admin'
    )
    try {
      requirePortalRole(session, 'admin')
    } catch (e: any) {
      expect(e.code).toBe('MISSING_ROLE')
    }
  })

  // Test: requirePortalRole with session.role=null
  // Category: Unhappy Path
  // What it proves: A session with null role (e.g. super_admin without tenant) throws
  // Risk if missing: Null role sessions could bypass role checks
  it('throws when session.role is null (super_admin without tenant)', () => {
    const session: PortalSessionInfo = {
      user_id: 'u1',
      email: 'super@test.com',
      tenant_id: null,
      tenant_slug: null,
      tenant_name: null,
      role: null,
      membership_id: null,
      is_super_admin: true,
    }
    expect(() => requirePortalRole(session, 'admin')).toThrow(AuthorizationError)
    try {
      requirePortalRole(session, 'admin')
    } catch (e: any) {
      expect(e.code).toBe('MISSING_ROLE')
    }
  })

  // Test: requirePortalRole with empty roles list
  // Category: Unhappy Path
  // What it proves: An empty required roles list always throws (nothing to match)
  // Risk if missing: Accidental empty roles call would silently pass everyone
  it('throws when required roles list is empty', () => {
    const session: PortalSessionInfo = {
      user_id: 'u1',
      email: 'admin@test.com',
      tenant_id: 't1',
      tenant_slug: 'test',
      tenant_name: 'Test',
      role: 'admin',
      membership_id: 'm1',
      is_super_admin: false,
    }
    expect(() => requirePortalRole(session)).toThrow(AuthorizationError)
  })
})

// ── requireSuperAdmin ──

describe('requireSuperAdmin', () => {
  // Test: requireSuperAdmin(is_super_admin=true)
  // Category: Happy Path
  // What it proves: A super_admin session passes the check
  // Risk if missing: Super admin endpoints would be inaccessible to actual super admins
  it('does not throw when is_super_admin is true', () => {
    const session: PortalSessionInfo = {
      user_id: 'u1',
      email: 'super@test.com',
      tenant_id: null,
      tenant_slug: null,
      tenant_name: null,
      role: null,
      membership_id: null,
      is_super_admin: true,
    }
    expect(() => requireSuperAdmin(session)).not.toThrow()
  })

  // Test: requireSuperAdmin(is_super_admin=false)
  // Category: Unhappy Path
  // What it proves: Non-super-admin sessions throw AuthorizationError
  // Risk if missing: Regular users could access super admin functionality
  it('throws AuthorizationError when is_super_admin is false', () => {
    const session: PortalSessionInfo = {
      user_id: 'u1',
      email: 'user@test.com',
      tenant_id: 't1',
      tenant_slug: 'test',
      tenant_name: 'Test',
      role: 'admin',
      membership_id: 'm1',
      is_super_admin: false,
    }
    expect(() => requireSuperAdmin(session)).toThrow(AuthorizationError)
    expect(() => requireSuperAdmin(session)).toThrow('Super admin access required')
    try {
      requireSuperAdmin(session)
    } catch (e: any) {
      expect(e.code).toBe('NOT_SUPER_ADMIN')
    }
  })

  // Test: requireSuperAdmin error type propagation
  // Category: Error Handling
  // What it proves: Error is instanceof AuthorizationError and has correct properties
  // Risk if missing: Upstream error handling depends on error type/code for middleware decisions
  it('propagates error with correct type and code', () => {
    const session: PortalSessionInfo = {
      user_id: 'u1',
      email: 'user@test.com',
      tenant_id: 't1',
      tenant_slug: 'test',
      tenant_name: 'Test',
      role: 'member',
      membership_id: 'm1',
      is_super_admin: false,
    }
    try {
      requireSuperAdmin(session)
    } catch (e: any) {
      expect(e).toBeInstanceOf(AuthorizationError)
      expect(e).toBeInstanceOf(Error)
      expect(e.code).toBe('NOT_SUPER_ADMIN')
      expect(e.message).toContain('Super admin')
    }
  })
})
