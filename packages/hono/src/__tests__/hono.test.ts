// ──────────────────────────────────────────────────────
// @tenantscale/hono — Tests
// ──────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { Mock } from 'vitest'
import {
  AuthenticationError,
  AuthorizationError,
  PlanLimitExceededError,
  RateLimitExceededError,
  NotFoundError,
  ConflictError,
} from '@tenantscale/sdk'
import type { ApiKeyInfo, PortalSessionInfo } from '@tenantscale/sdk'

// ── Module under test ──

import {
  authenticateApiKey,
  requireScope,
  requirePortalSession,
  requirePortalRole,
  requireSuperAdmin,
  requirePlanLimit,
  rateLimitByApiKey,
  rateLimitByIp,
  auditLog,
} from '../middleware.js'
import { errorHandler } from '../error-handler.js'

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
    getClientIp: vi.fn(),
    generateApiKey: vi.fn(),
    hashApiKey: vi.fn(),
    isValidApiKeyFormat: vi.fn(),
    parsePaginationParams: vi.fn(),
    paginationResponse: vi.fn(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    destroy: vi.fn(),
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

// ──────────────────────────────────────────────────────
// authenticateApiKey
// ──────────────────────────────────────────────────────

describe('authenticateApiKey', () => {
  let ts: ReturnType<typeof createMockTenantScale>

  beforeEach(() => {
    ts = createMockTenantScale()
    ts.validateApiKey.mockResolvedValue(mockApiKey)
  })

  it('should authenticate with Bearer token and set apiKey context', async () => {
    const app = new Hono()
    app.use('/api/*', authenticateApiKey({ ts }))
    app.get('/api/test', (c) => {
      const key = (c as any).get('apiKey') as ApiKeyInfo
      return c.json({ tenantId: key.tenant_id, scopes: key.scopes })
    })

    const res = await app.request('/api/test', {
      headers: { Authorization: 'Bearer tk_test_abc' },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ tenantId: 'tenant_1', scopes: ['admin', 'read'] })
  })

  it('should return 401 when Authorization header is missing', async () => {
    const app = new Hono()
    app.use('/api/*', authenticateApiKey({ ts }))
    app.get('/api/test', (c) => c.json({ ok: true }))

    const res = await app.request('/api/test')
    expect(res.status).toBe(401)
  })

  it('should return 401 for non-Bearer Authorization header', async () => {
    const app = new Hono()
    app.use('/api/*', authenticateApiKey({ ts }))
    app.get('/api/test', (c) => c.json({ ok: true }))

    const res = await app.request('/api/test', {
      headers: { Authorization: 'Basic dXNlcjpwYXNz' },
    })
    expect(res.status).toBe(401)
  })

  it('should return 401 when validateApiKey throws', async () => {
    ts.validateApiKey.mockRejectedValue(new AuthenticationError('Invalid key'))
    const app = new Hono()
    app.use('/api/*', authenticateApiKey({ ts }))
    app.get('/api/test', (c) => c.json({ ok: true }))

    const res = await app.request('/api/test', {
      headers: { Authorization: 'Bearer tk_bad' },
    })
    expect(res.status).toBe(401)
  })
})

// ──────────────────────────────────────────────────────
// requireScope
// ──────────────────────────────────────────────────────

describe('requireScope', () => {
  let ts: ReturnType<typeof createMockTenantScale>

  beforeEach(() => {
    ts = createMockTenantScale()
  })

  it('should pass when key has the required scope', async () => {
    const app = new Hono()
    app.use('/api/*', authenticateApiKey({ ts }), requireScope({ ts }, 'admin'))
    app.get('/api/test', (c) => c.json({ ok: true }))

    ts.validateApiKey.mockResolvedValue(mockApiKey)

    const res = await app.request('/api/test', {
      headers: { Authorization: 'Bearer tk_valid' },
    })
    expect(res.status).toBe(200)
  })

  it('should return 403 when key lacks scope', async () => {
    ts.requireScope.mockImplementation(() => {
      throw new AuthorizationError('Missing scope')
    })
    ts.validateApiKey.mockResolvedValue(mockApiKey)

    const app = new Hono()
    app.use('/api/*', authenticateApiKey({ ts }), requireScope({ ts }, 'super_admin'))
    app.get('/api/test', (c) => c.json({ ok: true }))

    const res = await app.request('/api/test', {
      headers: { Authorization: 'Bearer tk_valid' },
    })
    expect(res.status).toBe(403)
  })
})

// ──────────────────────────────────────────────────────
// requirePortalSession
// ──────────────────────────────────────────────────────

describe('requirePortalSession', () => {
  let ts: ReturnType<typeof createMockTenantScale>

  beforeEach(() => {
    ts = createMockTenantScale()
    ts.validateSession.mockResolvedValue(mockPortalSession)
  })

  it('should authenticate with Bearer JWT and set session context', async () => {
    const app = new Hono()
    app.use('/portal/*', requirePortalSession({ ts }))
    app.get('/portal/dashboard', (c) => {
      const session = (c as any).get('portalSession') as PortalSessionInfo
      return c.json({ email: session.email })
    })

    const res = await app.request('/portal/dashboard', {
      headers: { Authorization: 'Bearer jwt_valid' },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.email).toBe('admin@test.com')
  })

  it('should return 401 without Authorization header', async () => {
    const app = new Hono()
    app.use('/portal/*', requirePortalSession({ ts }))
    app.get('/portal/dashboard', (c) => c.json({ ok: true }))

    const res = await app.request('/portal/dashboard')
    expect(res.status).toBe(401)
  })

  it('should return 401 for invalid JWT', async () => {
    ts.validateSession.mockRejectedValue(new AuthenticationError('Invalid session'))
    const app = new Hono()
    app.use('/portal/*', requirePortalSession({ ts }))
    app.get('/portal/dashboard', (c) => c.json({ ok: true }))

    const res = await app.request('/portal/dashboard', {
      headers: { Authorization: 'Bearer jwt_bad' },
    })
    expect(res.status).toBe(401)
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

  it('should pass when session has required role', async () => {
    const app = new Hono()
    app.use('/portal/*', requirePortalSession({ ts }), requirePortalRole({ ts }, 'admin'))
    app.get('/portal/admin', (c) => c.json({ ok: true }))

    const res = await app.request('/portal/admin', {
      headers: { Authorization: 'Bearer jwt_valid' },
    })
    expect(res.status).toBe(200)
  })

  it('should return 403 when role does not match', async () => {
    ts.requirePortalRole.mockImplementation(() => {
      throw new AuthorizationError('Missing role')
    })
    const app = new Hono()
    app.use('/portal/*', requirePortalSession({ ts }), requirePortalRole({ ts }, 'super_admin'))
    app.get('/portal/admin', (c) => c.json({ ok: true }))

    const res = await app.request('/portal/admin', {
      headers: { Authorization: 'Bearer jwt_valid' },
    })
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
  })

  it('should pass for super admin sessions', async () => {
    ts.validateSession.mockResolvedValue({ ...mockPortalSession, is_super_admin: true })

    const app = new Hono()
    app.use('/admin/*', requirePortalSession({ ts }), requireSuperAdmin({ ts }))
    app.get('/admin/users', (c) => c.json({ ok: true }))

    const res = await app.request('/admin/users', {
      headers: { Authorization: 'Bearer jwt_super' },
    })
    expect(res.status).toBe(200)
  })

  it('should return 403 for non-admin users', async () => {
    ts.requireSuperAdmin.mockImplementation(() => {
      throw new AuthorizationError('Not super admin')
    })
    ts.validateSession.mockResolvedValue(mockPortalSession)

    const app = new Hono()
    app.use('/admin/*', requirePortalSession({ ts }), requireSuperAdmin({ ts }))
    app.get('/admin/users', (c) => c.json({ ok: true }))

    const res = await app.request('/admin/users', {
      headers: { Authorization: 'Bearer jwt_user' },
    })
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
    ts.plans.getPlanLimit.mockResolvedValue(10)
    ts.validateApiKey.mockResolvedValue(mockApiKey)
  })

  it('should pass when under the limit', async () => {
    const app = new Hono()
    app.use('/api/*', authenticateApiKey({ ts }))
    app.post('/api/tenants', requirePlanLimit({ ts }, 'max_tenants', 5), (c) =>
      c.json({ ok: true }),
    )

    const res = await app.request('/api/tenants', {
      method: 'POST',
      headers: { Authorization: 'Bearer tk_valid' },
    })
    expect(res.status).toBe(200)
  })

  it('should return 403 when at the limit', async () => {
    const app = new Hono()
    app.use('/api/*', authenticateApiKey({ ts }))
    app.post('/api/tenants', requirePlanLimit({ ts }, 'max_tenants', 10), (c) =>
      c.json({ ok: true }),
    )

    const res = await app.request('/api/tenants', {
      method: 'POST',
      headers: { Authorization: 'Bearer tk_valid' },
    })
    expect(res.status).toBe(403)
  })

  it('should pass when limit is null (unlimited)', async () => {
    ts.plans.getPlanLimit.mockResolvedValue(null)
    const app = new Hono()
    app.use('/api/*', authenticateApiKey({ ts }))
    app.post('/api/tenants', requirePlanLimit({ ts }, 'max_tenants', 999), (c) =>
      c.json({ ok: true }),
    )

    const res = await app.request('/api/tenants', {
      method: 'POST',
      headers: { Authorization: 'Bearer tk_valid' },
    })
    expect(res.status).toBe(200)
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
      remaining: 99,
      limit: 100,
      current: 1,
    })
  })

  it('should pass when under daily limit', async () => {
    const app = new Hono()
    app.use('/api/*', authenticateApiKey({ ts }), rateLimitByApiKey({ ts }))
    app.get('/api/test', (c) => c.json({ ok: true }))

    const res = await app.request('/api/test', {
      headers: { Authorization: 'Bearer tk_valid' },
    })
    expect(res.status).toBe(200)
  })

  it('should return 429 when over limit', async () => {
    ts.rateLimiter.checkDailyLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      limit: 100,
      current: 101,
    })
    const app = new Hono()
    app.use('/api/*', authenticateApiKey({ ts }), rateLimitByApiKey({ ts }))
    app.get('/api/test', (c) => c.json({ ok: true }))

    const res = await app.request('/api/test', {
      headers: { Authorization: 'Bearer tk_valid' },
    })
    expect(res.status).toBe(429)
  })

  it('should set rate limit headers on response', async () => {
    const app = new Hono()
    app.use('/api/*', authenticateApiKey({ ts }), rateLimitByApiKey({ ts }))
    app.get('/api/test', (c) => c.json({ ok: true }))

    const res = await app.request('/api/test', {
      headers: { Authorization: 'Bearer tk_valid' },
    })
    expect(res.headers.get('X-RateLimit-Limit-Daily')).toBe('100')
    expect(res.headers.get('X-RateLimit-Remaining-Daily')).toBe('99')
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
      resetAtMs: Date.now() + 3600000,
    })
  })

  it('should pass when IP is under creation limit', async () => {
    const app = new Hono()
    app.post('/signup', rateLimitByIp({ ts }), (c) => c.json({ ok: true }))

    const res = await app.request('/signup', { method: 'POST' })
    expect(res.status).toBe(200)
  })

  it('should return 429 when IP is blocked', async () => {
    ts.rateLimiter.checkIpCreationLimit.mockResolvedValue({
      blocked: true,
      remaining: 0,
      resetAtMs: Date.now() + 60000,
    })
    const app = new Hono()
    app.post('/signup', rateLimitByIp({ ts }), (c) => c.json({ ok: true }))

    const res = await app.request('/signup', { method: 'POST' })
    expect(res.status).toBe(429)
  })
})

// ──────────────────────────────────────────────────────
// auditLog
// ──────────────────────────────────────────────────────

describe('auditLog', () => {
  let ts: ReturnType<typeof createMockTenantScale>

  beforeEach(() => {
    ts = createMockTenantScale()
    ts.validateApiKey.mockResolvedValue(mockApiKey)
    ts.logAuditEvent.mockResolvedValue(undefined)
  })

  it('should log audit event with tenant context', async () => {
    const app = new Hono()
    app.use('/api/*', authenticateApiKey({ ts }))
    app.post(
      '/api/tenants',
      auditLog({ ts }, { action: 'tenant.create', resource: 'tenant' }),
      (c) => c.json({ ok: true }),
    )

    const res = await app.request('/api/tenants', {
      method: 'POST',
      headers: { Authorization: 'Bearer tk_valid', 'User-Agent': 'curl/8.0' },
    })
    expect(res.status).toBe(200)

    // Should have been called with correct event
    expect(ts.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant_1',
        action: 'tenant.create',
        resource: 'tenant',
        actor_type: 'admin_api',
      }),
    )
  })

  it('should not block response on audit failure', async () => {
    ts.logAuditEvent.mockRejectedValue(new Error('DB timeout'))
    const app = new Hono()
    app.use('/api/*', authenticateApiKey({ ts }))
    app.post('/api/tenants', auditLog({ ts }, { action: 'test', resource: 'test' }), (c) =>
      c.json({ ok: true }),
    )

    const res = await app.request('/api/tenants', {
      method: 'POST',
      headers: { Authorization: 'Bearer tk_valid' },
    })
    expect(res.status).toBe(200)
  })
})

// ──────────────────────────────────────────────────────
// errorHandler
// ──────────────────────────────────────────────────────

describe('errorHandler', () => {
  it('should return 401 for AuthenticationError', async () => {
    const app = new Hono()
    app.onError(errorHandler({ ts: createMockTenantScale() }))
    app.get('/test', () => {
      throw new AuthenticationError('Invalid key')
    })

    const res = await app.request('/test')
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.code).toBe('AUTH_FAILED')
  })

  it('should return 403 for AuthorizationError', async () => {
    const app = new Hono()
    app.onError(errorHandler({ ts: createMockTenantScale() }))
    app.get('/test', () => {
      throw new AuthorizationError('Forbidden')
    })

    const res = await app.request('/test')
    expect(res.status).toBe(403)
  })

  it('should return 403 with details for PlanLimitExceededError', async () => {
    const app = new Hono()
    app.onError(errorHandler({ ts: createMockTenantScale() }))
    app.get('/test', () => {
      throw new PlanLimitExceededError(10, 10, 'max_tenants')
    })

    const res = await app.request('/test')
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.details).toEqual({ limit: 10, current: 10 })
  })

  it('should return 429 for RateLimitExceededError', async () => {
    const app = new Hono()
    app.onError(errorHandler({ ts: createMockTenantScale() }))
    const err = new RateLimitExceededError(100)
    ;(err as any).retryAfter = 30
    app.get('/test', () => {
      throw err
    })

    const res = await app.request('/test')
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('30')
    const body = await res.json()
    expect(body.details).toEqual({ planLimit: 100 })
  })

  it('should return 404 for NotFoundError', async () => {
    const app = new Hono()
    app.onError(errorHandler({ ts: createMockTenantScale() }))
    app.get('/test', () => {
      throw new NotFoundError('tenant', 't_999')
    })

    const res = await app.request('/test')
    expect(res.status).toBe(404)
  })

  it('should return 409 for ConflictError', async () => {
    const app = new Hono()
    app.onError(errorHandler({ ts: createMockTenantScale() }))
    app.get('/test', () => {
      throw new ConflictError('Duplicate')
    })

    const res = await app.request('/test')
    expect(res.status).toBe(409)
  })

  it('should let Hono handle unknown errors with 500 response', async () => {
    const app = new Hono()
    app.onError(errorHandler({ ts: createMockTenantScale() }))
    app.get('/test', () => {
      throw new Error('Unknown')
    })

    const res = await app.request('/test')
    expect(res.status).toBe(500)
  })
})
