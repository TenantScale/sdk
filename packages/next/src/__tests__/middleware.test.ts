/*
 * MIT License
 *
 * Copyright (c) 2026 TenantScale
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

// ──────────────────────────────────────────────────────
// @tenantscale/next — Middleware Tests
// ──────────────────────────────────────────────────────
//
// Tests for the composable App Router middleware functions
// (requireScope, requirePortalRole, requireSuperAdmin,
// requirePlanLimit, rateLimitByApiKey, rateLimitByIp, auditLog).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Mock } from 'vitest'
import { AuthenticationError, AuthorizationError } from '@tenantscale/sdk'
import type { ApiKeyInfo, PortalSessionInfo } from '@tenantscale/sdk'
import {
  requireScope,
  requirePortalRole,
  requireSuperAdmin,
  requirePlanLimit,
  rateLimitByApiKey,
  rateLimitByIp,
  auditLog,
} from '../middleware.js'
import type { RouteParams } from '../types.js'

// Suppress console.error output from error handler during tests
const originalConsoleError = console.error
beforeEach(() => {
  console.error = vi.fn()
})
afterEach(() => {
  console.error = originalConsoleError
})

// ── Mocks ──

function createMockTenantScale(overrides: Record<string, Mock> = {}) {
  return {
    validateApiKey: vi.fn(),
    requireScope: vi.fn(),
    validateSession: vi.fn(),
    requirePortalRole: vi.fn(),
    requireSuperAdmin: vi.fn(),
    plans: { getPlanLimit: vi.fn() },
    rateLimiter: {
      checkDailyLimit: vi.fn(),
      checkIpCreationLimit: vi.fn(),
    },
    logAuditEvent: vi.fn().mockResolvedValue(undefined),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(() => {}),
    },
    ...overrides,
  } as any
}

const mockApiKey: ApiKeyInfo = {
  raw: 'tk_test_abc',
  tenant_id: 'tenant_1',
  scopes: ['admin', 'read'],
  created_by: 'user_1',
  key_record_id: 'key_1',
}

const mockPortalSession: PortalSessionInfo = {
  user_id: 'user_1',
  email: 'admin@test.com',
  tenant_id: 'tenant_1',
  tenant_slug: 'test-org',
  tenant_name: 'Test Org',
  role: 'admin',
  membership_id: 'mem_1',
  is_super_admin: false,
}

const routeParams: RouteParams = { params: Promise.resolve({}) }
const okHandler = () => Response.json({ ok: true })

function createMockRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/tenants', { headers })
}

// ──────────────────────────────────────────────────────
// requireScope
// ──────────────────────────────────────────────────────

describe('requireScope', () => {
  let ts: ReturnType<typeof createMockTenantScale>

  beforeEach(() => {
    ts = createMockTenantScale()
    ts.validateApiKey.mockResolvedValue(mockApiKey)
  })

  it('should allow requests whose API key holds a required scope', async () => {
    const res = await requireScope({ ts }, 'admin')(okHandler)(
      createMockRequest({ 'x-api-key': 'tk_test_abc' }),
      routeParams,
    )
    expect(res.status).toBe(200)
    expect(ts.requireScope).toHaveBeenCalledWith(mockApiKey, 'admin')
  })

  it('should return 401 when the API key is missing', async () => {
    ts.validateApiKey.mockRejectedValue(
      new AuthenticationError('Missing x-api-key header', 'AUTH_FAILED'),
    )
    const res = await requireScope({ ts }, 'admin')(okHandler)(createMockRequest({}), routeParams)
    expect(res.status).toBe(401)
  })

  it('should return 403 when the required scope is missing', async () => {
    ts.requireScope = vi.fn().mockImplementation(() => {
      throw new AuthorizationError('Missing required scope', 'MISSING_SCOPE')
    })
    const res = await requireScope({ ts }, 'billing')(okHandler)(
      createMockRequest({ 'x-api-key': 'tk_test_abc' }),
      routeParams,
    )
    expect(res.status).toBe(403)
  })
})

// ──────────────────────────────────────────────────────
// requirePortalRole
// ──────────────────────────────────────────────────────

describe('requirePortalRole', () => {
  let ts: ReturnType<typeof createMockTenantScale>

  beforeEach(() => {
    ts = createMockTenantScale()
    ts.validateSession.mockResolvedValue(mockPortalSession)
  })

  it('should allow requests whose session holds a required role', async () => {
    const res = await requirePortalRole({ ts }, 'admin')(okHandler)(
      createMockRequest({ authorization: 'Bearer jwt_valid' }),
      routeParams,
    )
    expect(res.status).toBe(200)
    expect(ts.requirePortalRole).toHaveBeenCalledWith(mockPortalSession, 'admin')
  })

  it('should return 403 when the required role is missing', async () => {
    ts.requirePortalRole = vi.fn().mockImplementation(() => {
      throw new AuthorizationError('Missing required role', 'MISSING_ROLE')
    })
    const res = await requirePortalRole({ ts }, 'owner')(okHandler)(
      createMockRequest({ authorization: 'Bearer jwt_valid' }),
      routeParams,
    )
    expect(res.status).toBe(403)
  })
})

// ──────────────────────────────────────────────────────
// requireSuperAdmin
// ──────────────────────────────────────────────────────

describe('requireSuperAdmin', () => {
  let ts: ReturnType<typeof createMockTenantScale>

  beforeEach(() => {
    ts = createMockTenantScale()
    ts.validateSession.mockResolvedValue({ ...mockPortalSession, is_super_admin: true })
  })

  it('should allow super admin sessions', async () => {
    const res = await requireSuperAdmin({ ts })(okHandler)(
      createMockRequest({ authorization: 'Bearer jwt_super' }),
      routeParams,
    )
    expect(res.status).toBe(200)
  })

  it('should return 403 for non-super-admin sessions', async () => {
    ts.validateSession.mockResolvedValue({ ...mockPortalSession, is_super_admin: false })
    ts.requireSuperAdmin = vi.fn().mockImplementation(() => {
      throw new AuthorizationError('Super admin access required', 'NOT_SUPER_ADMIN')
    })
    const res = await requireSuperAdmin({ ts })(okHandler)(
      createMockRequest({ authorization: 'Bearer jwt_user' }),
      routeParams,
    )
    expect(res.status).toBe(403)
  })
})

// ──────────────────────────────────────────────────────
// requirePlanLimit
// ──────────────────────────────────────────────────────

describe('requirePlanLimit', () => {
  let ts: ReturnType<typeof createMockTenantScale>

  beforeEach(() => {
    ts = createMockTenantScale()
    ts.validateApiKey.mockResolvedValue(mockApiKey)
    ts.plans.getPlanLimit.mockResolvedValue(10)
  })

  it('should allow requests under the plan limit', async () => {
    const res = await requirePlanLimit({ ts }, 'max_tenants', 5)(okHandler)(
      createMockRequest({ 'x-api-key': 'tk_test_abc' }),
      routeParams,
    )
    expect(res.status).toBe(200)
  })

  it('should support a currentCount function reading from the request', async () => {
    ts.plans.getPlanLimit.mockResolvedValue(3)
    const res = await requirePlanLimit({ ts }, 'max_tenants', async () => 2)(okHandler)(
      createMockRequest({ 'x-api-key': 'tk_test_abc' }),
      routeParams,
    )
    expect(res.status).toBe(200)
  })

  it('should return 403 when the plan limit is exceeded', async () => {
    const res = await requirePlanLimit({ ts }, 'max_tenants', 10)(okHandler)(
      createMockRequest({ 'x-api-key': 'tk_test_abc' }),
      routeParams,
    )
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.code).toBe('PLAN_LIMIT_REACHED')
  })
})

// ──────────────────────────────────────────────────────
// rateLimitByApiKey
// ──────────────────────────────────────────────────────

describe('rateLimitByApiKey', () => {
  let ts: ReturnType<typeof createMockTenantScale>

  beforeEach(() => {
    ts = createMockTenantScale()
    ts.validateApiKey.mockResolvedValue(mockApiKey)
    ts.rateLimiter.checkDailyLimit.mockResolvedValue({
      allowed: true,
      remaining: 80,
      limit: 100,
    })
  })

  it('should attach rate limit headers on success', async () => {
    const res = await rateLimitByApiKey({ ts })(okHandler)(
      createMockRequest({ 'x-api-key': 'tk_test_abc' }),
      routeParams,
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('X-RateLimit-Limit-Daily')).toBe('100')
    expect(res.headers.get('X-RateLimit-Remaining-Daily')).toBe('80')
  })

  it('should return 429 when the daily limit is exceeded', async () => {
    ts.rateLimiter.checkDailyLimit.mockResolvedValue({ allowed: false, remaining: 0, limit: 100 })
    const res = await rateLimitByApiKey({ ts })(okHandler)(
      createMockRequest({ 'x-api-key': 'tk_test_abc' }),
      routeParams,
    )
    expect(res.status).toBe(429)
  })
})

// ──────────────────────────────────────────────────────
// rateLimitByIp
// ──────────────────────────────────────────────────────

describe('rateLimitByIp', () => {
  let ts: ReturnType<typeof createMockTenantScale>

  beforeEach(() => {
    ts = createMockTenantScale()
    ts.rateLimiter.checkIpCreationLimit.mockResolvedValue({
      blocked: false,
      remaining: 5,
      resetAtMs: Date.now() + 60_000,
    })
  })

  it('should allow requests under the IP limit', async () => {
    const res = await rateLimitByIp({ ts })(okHandler)(
      createMockRequest({ 'x-forwarded-for': '203.0.113.5' }),
      routeParams,
    )
    expect(res.status).toBe(200)
    expect(ts.rateLimiter.checkIpCreationLimit).toHaveBeenCalledWith('203.0.113.5')
  })

  it('should return 429 and set Retry-After when the IP is blocked', async () => {
    ts.rateLimiter.checkIpCreationLimit.mockResolvedValue({
      blocked: true,
      remaining: 0,
      resetAtMs: Date.now() + 30_000,
    })
    const res = await rateLimitByIp({ ts })(okHandler)(
      createMockRequest({ 'x-forwarded-for': '203.0.113.5' }),
      routeParams,
    )
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBeTruthy()
  })
})

// ──────────────────────────────────────────────────────
// auditLog
// ──────────────────────────────────────────────────────

describe('auditLog', () => {
  let ts: ReturnType<typeof createMockTenantScale>

  beforeEach(() => {
    ts = createMockTenantScale()
  })

  it('should log an audit event with API key context and still run the handler', async () => {
    ts.validateApiKey.mockResolvedValue(mockApiKey)
    const res = await auditLog(
      { ts },
      { action: 'tenant.list', resource: '/api/tenants' },
    )(okHandler)(createMockRequest({ 'x-api-key': 'tk_test_abc' }), routeParams)
    expect(res.status).toBe(200)
    expect(ts.logAuditEvent).toHaveBeenCalled()
  })

  it('should fall back to session context when no API key is present', async () => {
    ts.validateApiKey.mockRejectedValue(new AuthenticationError('Missing header'))
    ts.validateSession.mockResolvedValue(mockPortalSession)
    const res = await auditLog(
      { ts },
      { action: 'tenant.list', resource: '/api/tenants' },
    )(okHandler)(createMockRequest({ authorization: 'Bearer jwt_valid' }), routeParams)
    expect(res.status).toBe(200)
    expect(ts.logAuditEvent).toHaveBeenCalled()
  })

  it('should never block the request when audit logging fails', async () => {
    ts.validateApiKey.mockRejectedValue(new AuthenticationError('Missing header'))
    ts.validateSession.mockRejectedValue(new AuthenticationError('Missing header'))
    const res = await auditLog(
      { ts },
      { action: 'tenant.list', resource: '/api/tenants' },
    )(okHandler)(createMockRequest({}), routeParams)
    expect(res.status).toBe(200)
  })
})

// ──────────────────────────────────────────────────────
// Composition with withApiKey / withSession
// ──────────────────────────────────────────────────────

describe('composition with handler wrappers', () => {
  let ts: ReturnType<typeof createMockTenantScale>

  beforeEach(() => {
    ts = createMockTenantScale()
    ts.validateApiKey.mockResolvedValue(mockApiKey)
    ts.validateSession.mockResolvedValue(mockPortalSession)
  })

  it('should compose withApiKey + requirePlanLimit + auditLog', async () => {
    ts.plans.getPlanLimit.mockResolvedValue(10)
    const { withApiKey } = await import('../handler.js')
    const route = withApiKey(
      { ts },
      requirePlanLimit(
        { ts },
        'max_tenants',
        5,
      )(
        auditLog(
          { ts },
          { action: 'tenant.read', resource: '/api/tenants' },
        )(async () => Response.json({ ok: true })),
      ),
    )
    const res = await route(createMockRequest({ 'x-api-key': 'tk_test_abc' }), routeParams)
    expect(res.status).toBe(200)
    expect(ts.logAuditEvent).toHaveBeenCalled()
  })
})
