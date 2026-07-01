// ──────────────────────────────────────────────────────
// Audit — Comprehensive Unit Tests
// ──────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getClientIp, createAuditEvent, logAuditEvent } from '../audit.js'
import type { AuditEventInput } from '../types.js'

// ── Tests ──

describe('getClientIp', () => {
  // ── Happy Path ──

  // Test: x-forwarded-for with single IP
  // Category: Happy Path
  // What it proves: The primary use case — single proxy IP is extracted correctly
  // Risk if missing: All IP detection would be broken, losing audit trail
  it('returns IP from x-forwarded-for with single IP', () => {
    const headers = { 'x-forwarded-for': '203.0.113.1' }
    expect(getClientIp(headers)).toBe('203.0.113.1')
  })

  // Test: x-forwarded-for with multiple IPs returns first IP
  // Category: Happy Path
  // What it proves: For proxy chains, the first (client) IP is returned
  // Risk if missing: The proxy's IP (last in chain) would be logged instead of the real client
  it('returns first IP from comma-separated x-forwarded-for', () => {
    const headers = { 'x-forwarded-for': '203.0.113.1, 10.0.0.1, 192.168.1.1' }
    expect(getClientIp(headers)).toBe('203.0.113.1')
  })

  // Test: x-real-ip used when x-forwarded-for absent
  // Category: Happy Path
  // What it proves: The fallback to x-real-ip works
  // Risk if missing: Some proxy setups that only set x-real-ip would be undetected
  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    const headers = { 'x-real-ip': '198.51.100.1' }
    expect(getClientIp(headers)).toBe('198.51.100.1')
  })

  // Test: Headers object (.get method) with single IP
  // Category: Happy Path
  // What it proves: Web API Headers objects (with .get()) work correctly
  // Risk if missing: Framework integrations using Headers API would break
  it('handles Web API Headers object', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.1' })
    expect(getClientIp(headers)).toBe('203.0.113.1')
  })

  // Test: Headers object with multiple IPs returns first
  // Category: Happy Path
  // What it proves: Comma-separated parsing works with Headers objects too
  // Risk if missing: Headers API path would ignore multiple IPs
  it('handles Headers object with multiple IPs', () => {
    const headers = new Headers({ 'x-forwarded-for': '192.0.2.1, 10.0.0.5' })
    expect(getClientIp(headers)).toBe('192.0.2.1')
  })

  // Test: Headers object with x-real-ip fallback
  // Category: Happy Path
  // What it proves: x-real-ip fallback works with Headers objects
  // Risk if missing: Headers object path would miss the fallback
  it('falls back to x-real-ip with Headers object', () => {
    const headers = new Headers({ 'x-real-ip': '198.51.100.2' })
    expect(getClientIp(headers)).toBe('198.51.100.2')
  })

  // ── Unhappy Path ──

  // Test: x-forwarded-for empty string falls through
  // Category: Unhappy Path
  // What it proves: Empty header value triggers fallback chain
  // Risk if missing: Empty values could be returned as-is, polluting audit logs
  it('falls through when x-forwarded-for is empty string', () => {
    const headers = { 'x-forwarded-for': '', 'x-real-ip': '198.51.100.3' }
    expect(getClientIp(headers)).toBe('198.51.100.3')
  })

  // Test: Neither header present returns 'unknown'
  // Category: Unhappy Path
  // What it proves: When no IP headers exist, 'unknown' is returned
  // Risk if missing: Missing IP would return undefined/null, breaking downstream consumers
  it('returns "unknown" when no IP headers are present', () => {
    const headers = {}
    expect(getClientIp(headers)).toBe('unknown')
  })

  // Test: x-forwarded-for with trailing whitespace
  // Category: Unhappy Path
  // What it proves: Trailing whitespace on IP is trimmed
  // Risk if missing: "203.0.113.1 " would be stored with trailing space, breaking lookups
  it('trims whitespace from x-forwarded-for IP', () => {
    const headers = { 'x-forwarded-for': '  203.0.113.1  ' }
    expect(getClientIp(headers)).toBe('203.0.113.1')
  })

  // Test: x-forwarded-for with IPv6
  // Category: Unhappy Path
  // What it proves: IPv6 addresses in x-forwarded-for are handled (no special parsing needed)
  // Risk if missing: IPv6 clients would have IP detection fail
  it('passes through IPv6 addresses', () => {
    const headers = { 'x-forwarded-for': '::1' }
    expect(getClientIp(headers)).toBe('::1')
  })

  // Test: x-forwarded-for with IPv6 in comma-separated
  // Category: Unhappy Path
  // What it proves: IPv6 addresses in proxy chains work
  // Risk if missing: IPv6 in proxy chains would silently fail
  it('returns first IP when IPv6 is in proxy chain', () => {
    const headers = { 'x-forwarded-for': '2001:db8::1, 10.0.0.1' }
    expect(getClientIp(headers)).toBe('2001:db8::1')
  })

  // Test: Headers object with missing all headers
  // Category: Unhappy Path
  // What it proves: Headers object with neither x-forwarded-for nor x-real-ip returns 'unknown'
  // Risk if missing: Headers object path without IP headers would throw
  it('returns "unknown" for Headers object with no IP headers', () => {
    const headers = new Headers({ 'content-type': 'application/json' })
    expect(getClientIp(headers)).toBe('unknown')
  })

  // Test: x-forwarded-for as array (Express style)
  // Category: Unhappy Path
  // What it proves: When headers has array values (Express can do this), the first array element is used
  // Risk if missing: Express header access patterns would break
  it('handles x-forwarded-for as an array (Express style)', () => {
    const headers = { 'x-forwarded-for': ['203.0.113.5', '10.0.0.1'] }
    expect(getClientIp(headers)).toBe('203.0.113.5')
  })

  // Test: x-real-ip as array (Express style)
  // Category: Unhappy Path
  // What it proves: Array-valued x-real-ip works
  // Risk if missing: Express headers that arrive as arrays would be missed
  it('handles x-real-ip as an array (Express style)', () => {
    const headers = { 'x-real-ip': ['203.0.113.6'] }
    expect(getClientIp(headers)).toBe('203.0.113.6')
  })

  // Test: x-forwarded-for with just whitespace
  // Category: Unhappy Path
  // What it proves: Whitespace-only value (after split/trim) is empty → falls through
  // Risk if missing: A header with just spaces could be returned as IP
  it('falls through when x-forwarded-for contains only whitespace', () => {
    const headers = { 'x-forwarded-for': '   ', 'x-real-ip': '10.0.0.1' }
    expect(getClientIp(headers)).toBe('10.0.0.1')
  })
})

// ── createAuditEvent ──

describe('createAuditEvent', () => {
  // Test: Basic usage with required params
  // Category: Happy Path
  // What it proves: Required params produce a valid AuditEventInput with defaults
  // Risk if missing: The core audit event creation would be broken
  it('returns AuditEventInput with required params and defaults', () => {
    const result = createAuditEvent('tenant_001', 'user.login', 'users')
    expect(result).toEqual({
      tenant_id: 'tenant_001',
      actor_type: 'system',
      action: 'user.login',
      resource: 'users',
    })
  })

  // Test: All overrides applied
  // Category: Happy Path
  // What it proves: Every override field replaces its default
  // Risk if missing: Callers couldn't set actor_id, details, IP, or user_agent
  it('applies all overrides correctly', () => {
    const result = createAuditEvent('tenant_001', 'user.login', 'users', {
      actor_id: 'user_001',
      actor_type: 'user',
      details: { method: 'oauth' },
      ip: '203.0.113.1',
      user_agent: 'Mozilla/5.0',
    })
    expect(result).toEqual({
      tenant_id: 'tenant_001',
      actor_id: 'user_001',
      actor_type: 'user',
      action: 'user.login',
      resource: 'users',
      details: { method: 'oauth' },
      ip: '203.0.113.1',
      user_agent: 'Mozilla/5.0',
    })
  })

  // Test: Partial overrides
  // Category: Happy Path
  // What it proves: Only provided override fields replace defaults; others remain
  // Risk if missing: Partial overrides would reset unprovided fields
  it('applies partial overrides and keeps defaults for rest', () => {
    const result = createAuditEvent('tenant_001', 'user.logout', 'sessions', {
      actor_id: 'user_001',
    })
    expect(result.actor_id).toBe('user_001')
    expect(result.actor_type).toBe('system') // default kept
    expect(result.details).toBeUndefined() // undefined since not in overrides
  })

  // Test: Empty overrides object
  // Category: Happy Path
  // What it proves: Empty overrides leaves all defaults unchanged
  // Risk if missing: Empty overrides could reset fields unexpectedly
  it('handles empty overrides object', () => {
    const result = createAuditEvent('tenant_001', 'test.action', 'test', {})
    expect(result.tenant_id).toBe('tenant_001')
    expect(result.actor_type).toBe('system')
    expect(result.action).toBe('test.action')
    expect(result.resource).toBe('test')
  })

  // Test: Default actor_type is 'system'
  // Category: Happy Path
  // What it proves: The default actor_type is 'system' when not overridden
  // Risk if missing: Default actor_type might change silently
  it('has default actor_type of "system"', () => {
    const result = createAuditEvent('t1', 'action', 'resource')
    expect(result.actor_type).toBe('system')
  })

  // Test: Unicode in action and resource
  // Category: Unhappy Path
  // What it proves: Unicode characters in action/resource are preserved
  // Risk if missing: Internationalized audit events would be corrupted
  it('preserves Unicode in action and resource', () => {
    const result = createAuditEvent('t1', 'ユーザー.ログイン', 'ユーザー')
    expect(result.action).toBe('ユーザー.ログイン')
    expect(result.resource).toBe('ユーザー')
  })

  // Test: Override actor_type to different valid types
  // Category: Happy Path
  // What it proves: All valid actor_type values can be set via override
  // Risk if missing: Different actor types couldn't be set
  it('allows setting different actor_type values', () => {
    expect(createAuditEvent('t1', 'a', 'r', { actor_type: 'user' }).actor_type).toBe('user')
    expect(createAuditEvent('t1', 'a', 'r', { actor_type: 'admin_api' }).actor_type).toBe('admin_api')
    expect(createAuditEvent('t1', 'a', 'r', { actor_type: 'admin_impersonation' }).actor_type).toBe('admin_impersonation')
    expect(createAuditEvent('t1', 'a', 'r', { actor_type: 'system' }).actor_type).toBe('system')
  })
})

// ── logAuditEvent ──

describe('logAuditEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const minimalInput: AuditEventInput = {
    tenant_id: 'tenant_001',
    actor_type: 'system',
    action: 'test.action',
    resource: 'test',
  }

  // Test: Successful insert resolves
  // Category: Happy Path
  // What it proves: A successful DB insert resolves without error
  // Risk if missing: Audit logging would silently fail without being caught
  it('resolves on successful insert', async () => {
    const mockInsert = vi.fn().mockResolvedValue(undefined)
    const mockSupabase = { from: vi.fn(() => ({ insert: mockInsert })) }

    await expect(logAuditEvent(mockSupabase as any, minimalInput)).resolves.toBeUndefined()
    expect(mockSupabase.from).toHaveBeenCalledWith('audit_events')
    expect(mockInsert).toHaveBeenCalled()
  })

  // Test: Insert with all fields populated
  // Category: Happy Path
  // What it proves: All input fields are passed to the insert correctly
  // Risk if missing: Some audit fields would be silently dropped
  it('passes all fields to insert', async () => {
    const mockInsert = vi.fn().mockResolvedValue(undefined)
    const mockSupabase = { from: vi.fn(() => ({ insert: mockInsert })) }

    const fullInput: AuditEventInput = {
      tenant_id: 'tenant_001',
      actor_id: 'user_001',
      actor_type: 'user',
      action: 'user.login',
      resource: 'users',
      details: { browser: 'Chrome' },
      ip: '203.0.113.1',
      user_agent: 'Mozilla/5.0',
    }

    await logAuditEvent(mockSupabase as any, fullInput)
    expect(mockInsert).toHaveBeenCalledWith(fullInput)
  })

  // Test: Insert with null actor_id
  // Category: Unhappy Path
  // What it proves: Null actor_id is passed as null (not omitted)
  // Risk if missing: Null values might break the insert schema
  it('passes null actor_id correctly', async () => {
    const mockInsert = vi.fn().mockResolvedValue(undefined)
    const mockSupabase = { from: vi.fn(() => ({ insert: mockInsert })) }

    const input: AuditEventInput = {
      tenant_id: 'tenant_001',
      actor_type: 'system',
      action: 'test',
      resource: 'test',
      actor_id: null,
    }

    await logAuditEvent(mockSupabase as any, input)
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ actor_id: null })
    )
  })

  // Test: Insert with undefined details → default empty object
  // Category: Unhappy Path
  // What it proves: Undefined details are replaced with empty object
  // Risk if missing: Null/undefined details could break DB insert
  it('defaults undefined details to empty object', async () => {
    const mockInsert = vi.fn().mockResolvedValue(undefined)
    const mockSupabase = { from: vi.fn(() => ({ insert: mockInsert })) }

    const input: AuditEventInput = {
      tenant_id: 'tenant_001',
      actor_type: 'system',
      action: 'test',
      resource: 'test',
      details: undefined,
    }

    await logAuditEvent(mockSupabase as any, input)
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ details: {} })
    )
  })

  // Test: Insert with null user_agent and ip
  // Category: Unhappy Path
  // What it proves: Null IP and user_agent are passed as null
  // Risk if missing: Null IP might not be null-coalesced correctly
  it('passes null ip and user_agent correctly', async () => {
    const mockInsert = vi.fn().mockResolvedValue(undefined)
    const mockSupabase = { from: vi.fn(() => ({ insert: mockInsert })) }

    const input: AuditEventInput = {
      tenant_id: 'tenant_001',
      actor_type: 'system',
      action: 'test',
      resource: 'test',
      ip: null,
      user_agent: null,
    }

    await logAuditEvent(mockSupabase as any, input)
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ ip: null, user_agent: null })
    )
  })

  // Test: Insert failure is caught and doesn't throw
  // Category: Error Handling
  // What it proves: DB insert errors are caught and logged, never thrown to caller
  // Risk if missing: An audit log failure would crash the main request handler
  it('catches insert errors and does not throw', async () => {
    const mockInsert = vi.fn().mockRejectedValue(new Error('DB connection timeout'))
    const mockSupabase = { from: vi.fn(() => ({ insert: mockInsert })) }

    // Should resolve gracefully (fire-and-forget)
    await expect(logAuditEvent(mockSupabase as any, minimalInput)).resolves.toBeUndefined()
  })

  // Test: Insert with empty string fields
  // Category: Unhappy Path
  // What it proves: Empty string fields are passed through correctly
  // Risk if missing: Empty strings could be treated as falsy and swapped for defaults
  it('handles empty string fields', async () => {
    const mockInsert = vi.fn().mockResolvedValue(undefined)
    const mockSupabase = { from: vi.fn(() => ({ insert: mockInsert })) }

    const input: AuditEventInput = {
      tenant_id: '',
      actor_type: 'system',
      action: '',
      resource: '',
    }

    await logAuditEvent(mockSupabase as any, input)
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: '', action: '', resource: '' })
    )
  })

  // Test: Multiple fire-and-forget calls don't block each other
  // Category: Happy Path
  // What it proves: Concurrent audit log calls all resolve independently
  // Risk if missing: Race conditions could cause audit events to be lost
  it('handles multiple concurrent calls', async () => {
    const mockInsert = vi.fn().mockResolvedValue(undefined)
    const mockSupabase = { from: vi.fn(() => ({ insert: mockInsert })) }

    await Promise.all([
      logAuditEvent(mockSupabase as any, { ...minimalInput, action: 'a' }),
      logAuditEvent(mockSupabase as any, { ...minimalInput, action: 'b' }),
      logAuditEvent(mockSupabase as any, { ...minimalInput, action: 'c' }),
    ])

    expect(mockInsert).toHaveBeenCalledTimes(3)
  })
})
