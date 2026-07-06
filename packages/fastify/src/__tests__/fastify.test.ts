import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import {
  AuthenticationError,
  AuthorizationError,
  PlanLimitExceededError,
  RateLimitExceededError,
} from '@tenantscale/sdk'

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

function createMockTenantScale(overrides: Record<string, any> = {}) {
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
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides,
  }
}

const mockApiKey = {
  raw: 'tk_test_abc',
  tenant_id: 'tenant_1',
  scopes: ['admin', 'read'],
  created_by: 'user_1',
  key_record_id: 'key_1',
}

const mockPortalSession = {
  user_id: 'user_1',
  email: 'admin@test.com',
  tenant_id: 'tenant_1',
  tenant_slug: 'test-org',
  tenant_name: 'Test Org',
  role: 'admin',
  membership_id: 'mem_1',
  is_super_admin: false,
}

async function buildApp(ts: any, plugin: any) {
  const app = Fastify()
  app.addHook('preHandler', plugin)
  app.get('/test', async () => ({ ok: true }))
  return app
}

describe('fastify adapter', () => {
  it('authenticates with x-api-key header', async () => {
    const ts = createMockTenantScale()
    ts.validateApiKey.mockResolvedValue(mockApiKey)
    const app = Fastify()
    app.addHook('preHandler', authenticateApiKey({ ts }))
    app.get('/test', async (req: any) => ({ tenantId: req.tenantId, scopes: req.tenantKey.scopes }))

    const res = await app.inject({ method: 'GET', url: '/test', headers: { 'x-api-key': 'tk_test_abc' } })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ tenantId: 'tenant_1', scopes: ['admin', 'read'] })
  })

  it('returns 401 when auth is missing', async () => {
    const ts = createMockTenantScale()
    const app = Fastify()
    app.addHook('preHandler', authenticateApiKey({ ts }))
    app.get('/test', async () => ({ ok: true }))

    const res = await app.inject({ method: 'GET', url: '/test' })
    expect(res.statusCode).toBe(401)
  })

  it('enforces required scopes', async () => {
    const ts = createMockTenantScale()
    ts.validateApiKey.mockResolvedValue(mockApiKey)
    ts.requireScope.mockImplementation(() => {
      throw new AuthorizationError('Missing scope')
    })
    const app = Fastify()
    app.addHook('preHandler', authenticateApiKey({ ts }))
    app.addHook('preHandler', requireScope({ ts }, 'super_admin'))
    app.get('/test', async () => ({ ok: true }))

    const res = await app.inject({ method: 'GET', url: '/test', headers: { 'x-api-key': 'tk_test_abc' } })
    expect(res.statusCode).toBe(403)
  })

  it('validates portal sessions', async () => {
    const ts = createMockTenantScale()
    ts.validateSession.mockResolvedValue(mockPortalSession)
    const app = Fastify()
    app.addHook('preHandler', requirePortalSession({ ts }))
    app.get('/test', async (req: any) => ({ email: req.portalSession.email }))

    const res = await app.inject({ method: 'GET', url: '/test', headers: { authorization: 'Bearer jwt_valid' } })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ email: 'admin@test.com' })
  })

  it('supports plan limit enforcement', async () => {
    const ts = createMockTenantScale()
    ts.plans.getPlanLimit.mockResolvedValue(1)
    const app = Fastify()
    app.addHook('preHandler', async (req: any) => {
      req.tenantId = 'tenant_1'
    })
    app.addHook('preHandler', requirePlanLimit({ ts }, 'max_tenants', 2))
    app.get('/test', async () => ({ ok: true }))

    const res = await app.inject({ method: 'GET', url: '/test' })
    expect(res.statusCode).toBe(403)
  })

  it('returns 403 for role mismatches', async () => {
    const ts = createMockTenantScale()
    ts.validateSession.mockResolvedValue(mockPortalSession)
    ts.requirePortalRole.mockImplementation(() => {
      throw new AuthorizationError('Missing role')
    })
    const app = Fastify()
    app.addHook('preHandler', requirePortalSession({ ts }))
    app.addHook('preHandler', requirePortalRole({ ts }, 'super_admin'))
    app.get('/test', async () => ({ ok: true }))

    const res = await app.inject({ method: 'GET', url: '/test', headers: { authorization: 'Bearer jwt_valid' } })
    expect(res.statusCode).toBe(403)
  })

  it('returns 429 for IP-based rate limits', async () => {
    const ts = createMockTenantScale()
    ts.rateLimiter.checkIpCreationLimit.mockResolvedValue({ blocked: true, resetAtMs: Date.now() + 30000 })
    const app = Fastify()
    app.addHook('preHandler', rateLimitByIp({ ts }))
    app.get('/test', async () => ({ ok: true }))

    const res = await app.inject({ method: 'GET', url: '/test' })
    expect(res.statusCode).toBe(429)
  })

  it('returns 429 when the API key hits its daily rate limit', async () => {
    const ts = createMockTenantScale()
    ts.validateApiKey.mockResolvedValue(mockApiKey)
    ts.rateLimiter.checkDailyLimit.mockResolvedValue({ allowed: false, limit: 100 })
    const app = Fastify()
    app.addHook('preHandler', authenticateApiKey({ ts }))
    app.addHook('preHandler', rateLimitByApiKey({ ts }))
    app.get('/test', async () => ({ ok: true }))

    const res = await app.inject({ method: 'GET', url: '/test', headers: { 'x-api-key': 'tk_test_abc' } })
    expect(res.statusCode).toBe(429)
  })

  it('requires super admin access after a portal session', async () => {
    const ts = createMockTenantScale()
    ts.validateSession.mockResolvedValue(mockPortalSession)
    ts.requireSuperAdmin.mockImplementation(() => {
      throw new AuthorizationError('Not a super admin')
    })
    const app = Fastify()
    app.addHook('preHandler', requirePortalSession({ ts }))
    app.addHook('preHandler', requireSuperAdmin({ ts }))
    app.get('/test', async () => ({ ok: true }))

    const res = await app.inject({ method: 'GET', url: '/test', headers: { authorization: 'Bearer jwt_valid' } })
    expect(res.statusCode).toBe(403)
  })

  it('logs an audit event when authentication succeeds', async () => {
    const ts = createMockTenantScale()
    ts.validateApiKey.mockResolvedValue(mockApiKey)
    const app = Fastify()
    app.addHook('preHandler', authenticateApiKey({ ts }))
    app.addHook('preHandler', auditLog({ ts }, { action: 'read', resource: '/test' }))
    app.get('/test', async () => ({ ok: true }))

    const res = await app.inject({ method: 'GET', url: '/test', headers: { 'x-api-key': 'tk_test_abc' } })
    expect(res.statusCode).toBe(200)
    expect(ts.logAuditEvent).toHaveBeenCalled()
  })

  it('uses the error handler for TenantScale errors', async () => {
    const app = Fastify()
    app.setErrorHandler(errorHandler())
    app.get('/test', async () => {
      throw new RateLimitExceededError(100)
    })

    const res = await app.inject({ method: 'GET', url: '/test' })
    expect(res.statusCode).toBe(429)
    expect(JSON.parse(res.body)).toMatchObject({ code: 'DAILY_LIMIT_EXCEEDED' })
  })
})
