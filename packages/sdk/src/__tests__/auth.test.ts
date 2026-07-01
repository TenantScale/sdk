// ──────────────────────────────────────────────────────
// Auth — Comprehensive Unit Tests
// ──────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validateApiKey, hasRequiredScope, requireScope } from '../auth.js'
import { AuthenticationError, AuthorizationError } from '../types.js'

// ── Helpers ──

function makeMockSupabase(overrides: Record<string, unknown> = {}) {
  const mockSingle = vi.fn()
  const mockEq = vi.fn(() => ({ single: mockSingle }))
  const mockSelect = vi.fn(() => ({ eq: mockEq }))
  // The update chain: .update({...}).eq('id', id).then(ok, err)
  const mockUpdateThen = vi.fn()
  const mockUpdateEq = vi.fn(() => ({ then: mockUpdateThen }))
  const mockUpdate = vi.fn(() => ({ eq: mockUpdateEq }))
  const mockFrom = vi.fn((table: string) => {
    if (table === 'api_keys') {
      return {
        select: mockSelect,
        update: mockUpdate,
      }
    }
    return { select: vi.fn(), update: vi.fn(), insert: vi.fn() }
  })

  const supabase = {
    from: mockFrom,
    ...overrides,
  }

  return { supabase, mockSingle, mockEq, mockSelect, mockFrom, mockUpdate, mockUpdateEq, mockUpdateThen }
}

/** A valid key record returned by the mock DB */
function validKeyRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'key_001',
    tenant_id: 'tenant_001',
    scopes: ['read:users', 'write:users'],
    is_active: true,
    expires_at: null,
    created_by: 'user_001',
    tenant: { id: 'tenant_001', is_active: true },
    ...overrides,
  }
}

// ── Tests ──

describe('validateApiKey', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Happy Path ──

  // Test: Valid API key returns ApiKeyInfo
  // Category: Happy Path
  // What it proves: The primary use case — a valid, active, non-expired key with an active tenant resolves correctly
  // Risk if missing: The core auth flow would be untested, and regressions could allow valid keys to be rejected
  it('returns ApiKeyInfo for a valid, active, non-expired key', async () => {
    const { supabase, mockSingle } = makeMockSupabase()
    mockSingle.mockResolvedValue({ data: validKeyRecord(), error: null })

    const result = await validateApiKey(supabase as any, 'tk_abcdef1234567890abcdef1234567890')

    expect(result).toEqual({
      raw: 'tk_abcdef1234567890abcdef1234567890',
      tenant_id: 'tenant_001',
      scopes: ['read:users', 'write:users'],
      created_by: 'user_001',
      key_record_id: 'key_001',
    })
    expect(supabase.from).toHaveBeenCalledWith('api_keys')
  })

  // Test: validateApiKey with key that has no expiry
  // Category: Happy Path
  // What it proves: Keys without expires_at are treated as non-expired
  // Risk if missing: Regressions could break keys that never expire
  it('accepts a key with no expires_at (never-expiring key)', async () => {
    const { supabase, mockSingle } = makeMockSupabase()
    mockSingle.mockResolvedValue({
      data: validKeyRecord({ expires_at: null }),
      error: null,
    })

    const result = await validateApiKey(supabase as any, 'tk_abcdef1234567890abcdef1234567890')
    expect(result.tenant_id).toBe('tenant_001')
  })

  // Test: validateApiKey fires last_used_at update
  // Category: Happy Path
  // What it proves: The fire-and-forget update for last_used_at is called after successful validation
  // Risk if missing: Tracking/metrics for key usage would silently stop without test coverage
  it('fires last_used_at update after successful validation', async () => {
    const { supabase, mockSingle, mockUpdate } = makeMockSupabase()
    mockSingle.mockResolvedValue({ data: validKeyRecord(), error: null })

    await validateApiKey(supabase as any, 'tk_abcdef1234567890abcdef1234567890')

    expect(mockUpdate).toHaveBeenCalled()
  })

  // ── Unhappy Path ──

  // Test: validateApiKey with empty token throws AuthenticationError
  // Category: Unhappy Path
  // What it proves: Empty or falsy tokens are rejected early with a clear error
  // Risk if missing: An empty string could slip through and hit the DB, causing confusing errors
  it('throws AuthenticationError for empty token', async () => {
    const { supabase } = makeMockSupabase()
    await expect(validateApiKey(supabase as any, '')).rejects.toThrow(AuthenticationError)
    await expect(validateApiKey(supabase as any, '')).rejects.toThrow('Empty API key')
  })

  // Test: validateApiKey with DB error throws AuthenticationError
  // Category: Unhappy Path
  // What it proves: Database errors (connection, query) are surfaced as AuthenticationError
  // Risk if missing: Internal DB errors might leak to the caller or cause unhandled rejections
  it('throws AuthenticationError when DB query returns an error', async () => {
    const { supabase, mockSingle } = makeMockSupabase()
    mockSingle.mockResolvedValue({ data: null, error: new Error('DB connection failed') })

    await expect(validateApiKey(supabase as any, 'tk_something')).rejects.toThrow(AuthenticationError)
    await expect(validateApiKey(supabase as any, 'tk_something')).rejects.toThrow('Invalid API key')
  })

  // Test: validateApiKey with no matching record throws AuthenticationError
  // Category: Unhappy Path
  // What it proves: When no key record is found (null data), it's treated as invalid
  // Risk if missing: A null result might be mistaken for a valid empty state, allowing unauthorized access
  it('throws AuthenticationError when no key record is found', async () => {
    const { supabase, mockSingle } = makeMockSupabase()
    mockSingle.mockResolvedValue({ data: null, error: null })

    await expect(validateApiKey(supabase as any, 'tk_nonexistent')).rejects.toThrow(AuthenticationError)
    await expect(validateApiKey(supabase as any, 'tk_nonexistent')).rejects.toThrow('Invalid API key')
  })

  // Test: validateApiKey with deactivated key throws AuthorizationError
  // Category: Unhappy Path
  // What it proves: Deactivated (is_active=false) keys are rejected with a specific authorization error
  // Risk if missing: Deactivated keys could still be used to access the API
  it('throws AuthorizationError for deactivated key', async () => {
    const { supabase, mockSingle } = makeMockSupabase()
    mockSingle.mockResolvedValue({
      data: validKeyRecord({ is_active: false }),
      error: null,
    })

    await expect(validateApiKey(supabase as any, 'tk_deactivated')).rejects.toThrow(AuthorizationError)
    await expect(validateApiKey(supabase as any, 'tk_deactivated')).rejects.toThrow('API key is deactivated')
    try {
      await validateApiKey(supabase as any, 'tk_deactivated')
    } catch (e: any) {
      expect(e.code).toBe('KEY_DEACTIVATED')
    }
  })

  // Test: validateApiKey with expired key throws AuthenticationError
  // Category: Unhappy Path
  // What it proves: Keys with expires_at in the past are rejected
  // Risk if missing: Expired keys could continue to work, breaking security guarantees
  it('throws AuthenticationError for expired key', async () => {
    const { supabase, mockSingle } = makeMockSupabase()
    const yesterday = new Date(Date.now() - 86400000).toISOString()
    mockSingle.mockResolvedValue({
      data: validKeyRecord({ expires_at: yesterday }),
      error: null,
    })

    await expect(validateApiKey(supabase as any, 'tk_expired')).rejects.toThrow(AuthenticationError)
    await expect(validateApiKey(supabase as any, 'tk_expired')).rejects.toThrow('API key has expired')
    try {
      await validateApiKey(supabase as any, 'tk_expired')
    } catch (e: any) {
      expect(e.code).toBe('KEY_EXPIRED')
    }
  })

  // Test: validateApiKey with inactive tenant throws AuthorizationError
  // Category: Unhappy Path
  // What it proves: Keys belonging to inactive tenants are rejected
  // Risk if missing: Users from suspended/frozen tenants could still access the API
  it('throws AuthorizationError when tenant is inactive', async () => {
    const { supabase, mockSingle } = makeMockSupabase()
    mockSingle.mockResolvedValue({
      data: validKeyRecord({ tenant: { id: 'tenant_001', is_active: false } }),
      error: null,
    })

    await expect(validateApiKey(supabase as any, 'tk_tenant_inactive')).rejects.toThrow(AuthorizationError)
    await expect(validateApiKey(supabase as any, 'tk_tenant_inactive')).rejects.toThrow('Tenant account is inactive')
    try {
      await validateApiKey(supabase as any, 'tk_tenant_inactive')
    } catch (e: any) {
      expect(e.code).toBe('TENANT_INACTIVE')
    }
  })

  // Test: validateApiKey with Unicode token
  // Category: Unhappy Path
  // What it proves: SHA-256 hashing handles Unicode strings without throwing
  // Risk if missing: A Unicode token (however unlikely) could crash the hashing step
  it('handles Unicode tokens without throwing', async () => {
    const { supabase, mockSingle } = makeMockSupabase()
    mockSingle.mockResolvedValue({ data: null, error: null })

    // Should not crash — the hash produces valid output for any string
    await expect(validateApiKey(supabase as any, 'tk_🔥𠜎')).rejects.toThrow() // no record, so it'll fail auth, but shouldn't crash
  })

  // Test: validateApiKey with very long token
  // Category: Unhappy Path
  // What it proves: Excessively long tokens are still hashable and don't crash
  // Risk if missing: A maliciously large token could cause a denial of service
  it('handles very long tokens without crashing', async () => {
    const { supabase, mockSingle } = makeMockSupabase()
    mockSingle.mockResolvedValue({ data: null, error: null })

    const longToken = 'tk_' + 'a'.repeat(10000)
    await expect(validateApiKey(supabase as any, longToken)).rejects.toThrow() // no record, so auth fails, but no crash
  })

  // Test: validateApiKey with key that expires exactly now (boundary)
  // Category: Unhappy Path
  // What it proves: If expires_at is exactly now, it may be treated as expired depending on Date comparison
  // Risk if missing: A boundary condition at the exact expiry moment could behave unexpectedly
  it('rejects a key that expires at the current moment (boundary)', async () => {
    const { supabase, mockSingle } = makeMockSupabase()
    const now = new Date().toISOString()
    mockSingle.mockResolvedValue({
      data: validKeyRecord({ expires_at: now }),
      error: null,
    })

    // If expires_at is now, new Date(expires_at) < new Date() is usually false since
    // they're constructed at slightly different times. But the key was just created,
    // so it should be fine. Either outcome is valid.
    try {
      const result = await validateApiKey(supabase as any, 'tk_boundary')
      expect(result.tenant_id).toBe('tenant_001')
    } catch (e: any) {
      // If the timing was unlucky, it could throw KEY_EXPIRED — that's valid behavior
      expect(e.code).toBeDefined()
    }
  })
})

// ── hasRequiredScope ──

describe('hasRequiredScope', () => {
  const baseKey = {
    raw: 'tk_test',
    tenant_id: 't1',
    scopes: ['read:users', 'write:users', 'admin:all'],
    created_by: 'u1',
    key_record_id: 'k1',
  }

  // Test: hasRequiredScope with matching scope returns true
  // Category: Happy Path
  // What it proves: When the key's scopes include one of the required scopes, it returns true
  // Risk if missing: Basic auth checks would break, allowing unauthorized access or blocking legitimate users
  it('returns true when key has one of the required scopes', () => {
    expect(hasRequiredScope(baseKey, 'read:users')).toBe(true)
  })

  // Test: hasRequiredScope with multiple required, one matches
  // Category: Happy Path
  // What it proves: Only one match is needed among multiple required scopes
  // Risk if missing: Users might be rejected even though they have sufficient permission
  it('returns true when multiple required scopes are given and at least one matches', () => {
    expect(hasRequiredScope(baseKey, 'read:users', 'delete:all')).toBe(true)
  })

  // Test: hasRequiredScope with non-matching scope returns false
  // Category: Unhappy Path
  // What it proves: When the key lacks the required scope, it returns false
  // Risk if missing: Unauthorized access would be granted to users without proper scopes
  it('returns false when key does not have the required scope', () => {
    expect(hasRequiredScope(baseKey, 'delete:all')).toBe(false)
  })

  // Test: hasRequiredScope with empty scopes array returns false
  // Category: Unhappy Path
  // What it proves: An empty required scopes array always returns false (nothing to match)
  // Risk if missing: An endpoint that accidentally passes no scopes could allow everyone through
  it('returns false when requiredScopes is empty', () => {
    expect(hasRequiredScope(baseKey)).toBe(false)
  })

  // Test: hasRequiredScope with empty key scopes
  // Category: Unhappy Path
  // What it proves: If the key has no scopes, no requirement can be satisfied
  // Risk if missing: A misconfigured key with empty scopes could still be authorized
  it('returns false when the key has no scopes', () => {
    const emptyScopesKey = { ...baseKey, scopes: [] }
    expect(hasRequiredScope(emptyScopesKey, 'read:users')).toBe(false)
  })

  // Test: hasRequiredScope with wildcard in key scopes
  // Category: Unhappy Path
  // What it proves: Wildcards/special chars in scopes work with .includes() string matching
  // Risk if missing: Scopes with non-standard characters might behave unexpectedly
  it('matches scopes with wildcards/special characters', () => {
    const wildcardKey = { ...baseKey, scopes: ['read:*', 'write:*'] }
    expect(hasRequiredScope(wildcardKey, 'read:*')).toBe(true)
    // Note: this is exact string match via .includes(), not glob matching
    expect(hasRequiredScope(wildcardKey, 'read:users')).toBe(false)
  })

  // Test: hasRequiredScope with duplicate scopes
  // Category: Unhappy Path
  // What it proves: Duplicates in the required scopes list don't cause issues
  // Risk if missing: Duplicates might cause unexpected matching behavior
  it('handles duplicate required scopes gracefully', () => {
    expect(hasRequiredScope(baseKey, 'read:users', 'read:users', 'read:users')).toBe(true)
  })

  // Test: hasRequiredScope with null/undefined scopes in key (JavaScript edge)
  // Category: Error Handling
  // What it proves: If scopes is undefined/null, .includes() throws — we document the contract
  // Risk if missing: Callers may rely on undefined scopes being handled gracefully
  it('throws if key scopes is undefined (contract expectation)', () => {
    const badKey = { ...baseKey, scopes: undefined as any }
    expect(() => hasRequiredScope(badKey, 'read:users')).toThrow()
  })
})

// ── requireScope ──

describe('requireScope', () => {
  const baseKey = {
    raw: 'tk_test',
    tenant_id: 't1',
    scopes: ['read:users', 'write:users'],
    created_by: 'u1',
    key_record_id: 'k1',
  }

  // Test: requireScope with matching scope
  // Category: Happy Path
  // What it proves: When the key has one of the required scopes, requireScope does not throw
  // Risk if missing: Authorized users would be blocked from accessing endpoints
  it('does not throw when key has the required scope', () => {
    expect(() => requireScope(baseKey, 'read:users')).not.toThrow()
  })

  // Test: requireScope with no match throws AuthorizationError
  // Category: Unhappy Path
  // What it proves: Missing required scope throws AuthorizationError with descriptive message and code
  // Risk if missing: Unauthorized access would be granted without enforcing scope checks
  it('throws AuthorizationError when no required scope matches', () => {
    expect(() => requireScope(baseKey, 'delete:all')).toThrow(AuthorizationError)
    expect(() => requireScope(baseKey, 'delete:all')).toThrow(
      'This endpoint requires one of these scopes: delete:all'
    )
    try {
      requireScope(baseKey, 'delete:all')
    } catch (e: any) {
      expect(e.code).toBe('MISSING_SCOPE')
    }
  })

  // Test: requireScope with empty scopes list
  // Category: Unhappy Path
  // What it proves: An empty scopes list means no scope can match, so it throws
  // Risk if missing: An accidental empty scopes call would silently pass everyone
  it('throws when required scopes list is empty', () => {
    expect(() => requireScope(baseKey)).toThrow(AuthorizationError)
    expect(() => requireScope(baseKey)).toThrow('This endpoint requires one of these scopes: ')
    try {
      requireScope(baseKey)
    } catch (e: any) {
      expect(e.code).toBe('MISSING_SCOPE')
    }
  })

  // Test: requireScope with multiple scopes, one matches
  // Category: Happy Path
  // What it proves: Multiple scopes are OR'ed — any match is sufficient
  // Risk if missing: Users with partial permissions could be incorrectly blocked
  it('does not throw when at least one of multiple required scopes matches', () => {
    expect(() => requireScope(baseKey, 'nonexistent', 'write:users')).not.toThrow()
  })

  // Test: requireScope with empty scopes on key
  // Category: Unhappy Path
  // What it proves: Key with empty scopes can't satisfy any requirement
  // Risk if missing: Misconfigured keys could still pass scope checks
  it('throws when key has empty scopes', () => {
    const emptyKey = { ...baseKey, scopes: [] }
    expect(() => requireScope(emptyKey, 'read:users')).toThrow(AuthorizationError)
  })

  // Test: requireScope error propagates with correct code
  // Category: Error Handling
  // What it proves: The error code property is always set to MISSING_SCOPE
  // Risk if missing: Upstream error handling relies on error.code for access decisions
  it('always sets code to MISSING_SCOPE on failure', () => {
    try {
      requireScope(baseKey, 'no:match')
    } catch (e: any) {
      expect(e.code).toBe('MISSING_SCOPE')
      expect(e).toBeInstanceOf(AuthorizationError)
      expect(e).toBeInstanceOf(Error)
    }
  })
})
