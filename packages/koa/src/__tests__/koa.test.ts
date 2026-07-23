import { describe, it, expect, vi, beforeEach } from 'vitest'
import Koa from 'koa'
import { AuthenticationError, AuthorizationError, RateLimitExceededError } from '@tenantscale/sdk'
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

async function request(app: Koa, path = '/test', headers: Record<string, string> = {}) {
  const server = app.listen(0)
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers })
  server.close()
  return res
}

describe('koa adapter', () => {
  it('authenticates with x-api-key header', async () => {
    const ts = createMockTenantScale()
    ts.validateApiKey.mockResolvedValue(mockApiKey)
    const app = new Koa()
    app.use(authenticateApiKey({ ts }))
    app.use(async (ctx) => {
      ctx.body = { tenantId: (ctx as any).tenantId, scopes: (ctx as any).tenantKey.scopes }
    })

    const res = await request(app, '/test', { 'x-api-key': 'tk_test_abc' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ tenantId: 'tenant_1', scopes: ['admin', 'read'] })
  })

  it('returns 401 when auth is missing', async () => {
    const ts = createMockTenantScale()
    const app = new Koa()
    app.use(authenticateApiKey({ ts }))
    app.use(async (ctx) => {
      ctx.body = { ok: true }
    })

    const res = await request(app)
    expect(res.status).toBe(401)
  })

  it('enforces required scopes', async () => {
    const ts = createMockTenantScale()
    ts.validateApiKey.mockResolvedValue(mockApiKey)
    ts.requireScope.mockImplementation(() => {
      throw new AuthorizationError('Missing scope')
    })
    const app = new Koa()
    app.use(authenticateApiKey({ ts }))
    app.use(requireScope({ ts }, 'super_admin'))
    app.use(async (ctx) => {
      ctx.body = { ok: true }
    })

    const res = await request(app, '/test', { 'x-api-key': 'tk_test_abc' })
    expect(res.status).toBe(403)
  })

  it('validates portal sessions', async () => {
    const ts = createMockTenantScale()
    ts.validateSession.mockResolvedValue(mockPortalSession)
    const app = new Koa()
    app.use(requirePortalSession({ ts }))
    app.use(async (ctx) => {
      ctx.body = { email: (ctx as any).portalSession.email }
    })

    const res = await request(app, '/test', { authorization: 'Bearer jwt_valid' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ email: 'admin@test.com' })
  })

  it('supports rate limit middleware', async () => {
    const ts = createMockTenantScale()
    ts.validateApiKey.mockResolvedValue(mockApiKey)
    ts.rateLimiter.checkDailyLimit.mockResolvedValue({ allowed: false, limit: 100 })
    const app = new Koa()
    app.use(authenticateApiKey({ ts }))
    app.use(rateLimitByApiKey({ ts }))
    app.use(async (ctx) => {
      ctx.body = { ok: true }
    })

    const res = await request(app, '/test', { 'x-api-key': 'tk_test_abc' })
    expect(res.status).toBe(429)
  })

  it('returns 403 for role mismatches', async () => {
    const ts = createMockTenantScale()
    ts.validateSession.mockResolvedValue(mockPortalSession)
    ts.requirePortalRole.mockImplementation(() => {
      throw new AuthorizationError('Missing role')
    })
    const app = new Koa()
    app.use(requirePortalSession({ ts }))
    app.use(requirePortalRole({ ts }, 'super_admin'))
    app.use(async (ctx) => {
      ctx.body = { ok: true }
    })

    const res = await request(app, '/test', { authorization: 'Bearer jwt_valid' })
    expect(res.status).toBe(403)
  })

  it('returns 403 for super admin mismatches', async () => {
    const ts = createMockTenantScale()
    ts.validateSession.mockResolvedValue(mockPortalSession)
    ts.requireSuperAdmin.mockImplementation(() => {
      throw new AuthorizationError('Not a super admin')
    })
    const app = new Koa()
    app.use(requirePortalSession({ ts }))
    app.use(requireSuperAdmin({ ts }))
    app.use(async (ctx) => {
      ctx.body = { ok: true }
    })

    const res = await request(app, '/test', { authorization: 'Bearer jwt_valid' })
    expect(res.status).toBe(403)
  })

  it('returns 429 for IP-based rate limits', async () => {
    const ts = createMockTenantScale()
    ts.rateLimiter.checkIpCreationLimit.mockResolvedValue({
      blocked: true,
      resetAtMs: Date.now() + 30000,
    })
    const app = new Koa()
    app.use(rateLimitByIp({ ts }))
    app.use(async (ctx) => {
      ctx.body = { ok: true }
    })

    const res = await request(app)
    expect(res.status).toBe(429)
  })

  it('logs an audit event after successful authentication', async () => {
    const ts = createMockTenantScale()
    ts.validateApiKey.mockResolvedValue(mockApiKey)
    const app = new Koa()
    app.use(authenticateApiKey({ ts }))
    app.use(auditLog({ ts }, { action: 'read', resource: '/test' }))
    app.use(async (ctx) => {
      ctx.body = { ok: true }
    })

    const res = await request(app, '/test', { 'x-api-key': 'tk_test_abc' })
    expect(res.status).toBe(200)
    expect(ts.logAuditEvent).toHaveBeenCalled()
  })

  it('uses the error handler with TenantScale errors', async () => {
    const app = new Koa()
    app.use(errorHandler())
    app.use(async () => {
      throw new RateLimitExceededError(100)
    })

    const res = await request(app)
    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ code: 'DAILY_LIMIT_EXCEEDED' })
  })
})
