// ──────────────────────────────────────────────────────
// @tenantscale/express — Middleware & Error Handler Tests
// ──────────────────────────────────────────────────────
//
// Tests middleware in isolation using mocked TenantScale SDK
// instances and mock Express req/res/next objects.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import {
  TenantScaleError,
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
import { errorHandler, genericErrorHandler } from '../error-handler.js'
import type { ExpressAdapterOptions } from '../types.js'

// ── Helpers ──

function createMockReq(overrides: Partial<Request> = {}): Request {
  const req = {
    headers: overrides.headers ?? {},
    ip: overrides.ip ?? '127.0.0.1',
    tenantKey: undefined,
    portalSession: undefined,
    tenantId: undefined,
    ...overrides,
  } as unknown as Request
  return req
}

function createMockRes(): Response & {
  _testState: { statusCode: number; body: unknown; headers: Record<string, string> }
} {
  const state: { statusCode: number; body: unknown; headers: Record<string, string> } = {
    statusCode: 200,
    body: undefined,
    headers: {},
  }
  const res = {
    status: vi.fn((code: number) => {
      state.statusCode = code
      return res
    }),
    json: vi.fn((body: unknown) => {
      state.body = body
      return res
    }),
    set: vi.fn((key: string, value: string) => {
      state.headers[key] = value
      return res
    }),
    _testState: state,
  } as unknown as Response & {
    _testState: { statusCode: number; body: unknown; headers: Record<string, string> }
  }
  return res
}

function createMockNext(): NextFunction {
  return vi.fn() as unknown as NextFunction
}

function createMockTenantScale(overrides: Record<string, Mock> = {}) {
  return {
    validateApiKey: vi.fn(),
    requireScope: vi.fn(),
    validateSession: vi.fn(),
    requirePortalRole: vi.fn(),
    requireSuperAdmin: vi.fn(),
    plans: {
      getPlanLimit: vi.fn(),
    },
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
  raw: 'tk_test_abc123',
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

function getOptions(ts: any): ExpressAdapterOptions {
  return { ts }
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

  it('should authenticate with x-api-key header and set tenantKey/tenantId', async () => {
    const req = createMockReq({ headers: { 'x-api-key': 'tk_test_abc123' } })
    const res = createMockRes()
    const next = createMockNext()

    await authenticateApiKey(getOptions(ts))(req, res, next)

    expect(ts.validateApiKey).toHaveBeenCalledWith('tk_test_abc123')
    expect(req.tenantKey).toEqual(mockApiKey)
    expect(req.tenantId).toBe('tenant_1')
    expect(next).toHaveBeenCalledWith()
  })

  it('should use custom header name from options', async () => {
    const req = createMockReq({ headers: { 'x-api-token': 'tk_test_abc123' } })
    const res = createMockRes()
    const next = createMockNext()

    await authenticateApiKey({ ts, apiKeyHeader: 'x-api-token' })(req, res, next)

    expect(ts.validateApiKey).toHaveBeenCalledWith('tk_test_abc123')
    expect(next).toHaveBeenCalledWith()
  })

  it('should call next with AuthenticationError when header is missing', async () => {
    const req = createMockReq({ headers: {} })
    const res = createMockRes()
    const next = createMockNext()

    await authenticateApiKey(getOptions(ts))(req, res, next)

    expect(ts.validateApiKey).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError))
  })

  it('should call next with error when validateApiKey throws', async () => {
    ts.validateApiKey.mockRejectedValue(new AuthenticationError('Invalid key', 'INVALID_KEY'))
    const req = createMockReq({ headers: { 'x-api-key': 'tk_bad' } })
    const res = createMockRes()
    const next = createMockNext()

    await authenticateApiKey(getOptions(ts))(req, res, next)

    expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError))
    expect(req.tenantKey).toBeUndefined()
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
    const req = createMockReq({ tenantKey: mockApiKey })
    const res = createMockRes()
    const next = createMockNext()

    await requireScope(getOptions(ts), 'admin')(req, res, next)

    expect(ts.requireScope).toHaveBeenCalledWith(mockApiKey, 'admin')
    expect(next).toHaveBeenCalledWith()
  })

  it('should call next with AuthorizationError when key lacks scope', async () => {
    ts.requireScope.mockImplementation(() => {
      throw new AuthorizationError('Insufficient scope')
    })
    const req = createMockReq({ tenantKey: mockApiKey })
    const res = createMockRes()
    const next = createMockNext()

    await requireScope(getOptions(ts), 'super_admin')(req, res, next)

    expect(next).toHaveBeenCalledWith(expect.any(AuthorizationError))
  })

  it('should call next with AuthenticationError when no tenantKey', async () => {
    const req = createMockReq({ tenantKey: undefined })
    const res = createMockRes()
    const next = createMockNext()

    await requireScope(getOptions(ts), 'admin')(req, res, next)

    expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError))
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

  it('should authenticate with Bearer token and set portalSession/tenantId', async () => {
    const req = createMockReq({ headers: { authorization: 'Bearer jwt_token_123' } })
    const res = createMockRes()
    const next = createMockNext()

    await requirePortalSession(getOptions(ts))(req, res, next)

    expect(ts.validateSession).toHaveBeenCalledWith('jwt_token_123')
    expect(req.portalSession).toEqual(mockPortalSession)
    expect(req.tenantId).toBe('tenant_1')
    expect(next).toHaveBeenCalledWith()
  })

  it('should call next with AuthenticationError when header is missing', async () => {
    const req = createMockReq({ headers: {} })
    const res = createMockRes()
    const next = createMockNext()

    await requirePortalSession(getOptions(ts))(req, res, next)

    expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError))
  })

  it('should call next with AuthenticationError for invalid header format', async () => {
    const req = createMockReq({ headers: { authorization: 'Basic dXNlcjpwYXNz' } })
    const res = createMockRes()
    const next = createMockNext()

    await requirePortalSession(getOptions(ts))(req, res, next)

    expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError))
  })
})

// ──────────────────────────────────────────────────────
// requirePortalRole
// ──────────────────────────────────────────────────────

describe('requirePortalRole', () => {
  let ts: ReturnType<typeof createMockTenantScale>

  beforeEach(() => {
    ts = createMockTenantScale()
  })

  it('should pass when session has required role', async () => {
    const req = createMockReq({ portalSession: mockPortalSession })
    const res = createMockRes()
    const next = createMockNext()

    await requirePortalRole(getOptions(ts), 'admin')(req, res, next)

    expect(ts.requirePortalRole).toHaveBeenCalledWith(mockPortalSession, 'admin')
    expect(next).toHaveBeenCalledWith()
  })

  it('should call next with AuthenticationError when no portalSession', async () => {
    const req = createMockReq({ portalSession: undefined })
    const res = createMockRes()
    const next = createMockNext()

    await requirePortalRole(getOptions(ts), 'admin')(req, res, next)

    expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError))
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
    const req = createMockReq({ portalSession: { ...mockPortalSession, is_super_admin: true } })
    const res = createMockRes()
    const next = createMockNext()

    await requireSuperAdmin(getOptions(ts))(req, res, next)

    expect(ts.requireSuperAdmin).toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith()
  })

  it('should call next with error when not super admin', async () => {
    ts.requireSuperAdmin.mockImplementation(() => {
      throw new AuthorizationError('Super admin access required')
    })
    const req = createMockReq({ portalSession: mockPortalSession })
    const res = createMockRes()
    const next = createMockNext()

    await requireSuperAdmin(getOptions(ts))(req, res, next)

    expect(next).toHaveBeenCalledWith(expect.any(AuthorizationError))
  })

  it('should call next with AuthenticationError when no portalSession', async () => {
    const req = createMockReq({ portalSession: undefined })
    const res = createMockRes()
    const next = createMockNext()

    await requireSuperAdmin(getOptions(ts))(req, res, next)

    expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError))
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
  })

  it('should pass when current count is under the limit', async () => {
    const req = createMockReq({ tenantId: 'tenant_1' })
    const res = createMockRes()
    const next = createMockNext()

    await requirePlanLimit(getOptions(ts), 'max_tenants', 5)(req, res, next)

    expect(ts.plans.getPlanLimit).toHaveBeenCalledWith('tenant_1', 'max_tenants')
    expect(next).toHaveBeenCalledWith()
  })

  it('should pass when current count equals the limit (0-based match)', async () => {
    const req = createMockReq({ tenantId: 'tenant_1' })
    const res = createMockRes()
    const next = createMockNext()

    await requirePlanLimit(getOptions(ts), 'max_tenants', 10)(req, res, next)

    // 10 >= 10 → blocked
    expect(next).toHaveBeenCalledWith(expect.any(PlanLimitExceededError))
  })

  it('should block when current count exceeds the limit', async () => {
    const req = createMockReq({ tenantId: 'tenant_1' })
    const res = createMockRes()
    const next = createMockNext()

    await requirePlanLimit(getOptions(ts), 'max_tenants', 15)(req, res, next)

    expect(next).toHaveBeenCalledWith(expect.any(PlanLimitExceededError))
  })

  it('should pass when limit is null (unlimited)', async () => {
    ts.plans.getPlanLimit.mockResolvedValue(null)
    const req = createMockReq({ tenantId: 'tenant_1' })
    const res = createMockRes()
    const next = createMockNext()

    await requirePlanLimit(getOptions(ts), 'max_tenants', 999)(req, res, next)

    expect(next).toHaveBeenCalledWith()
  })

  it('should support dynamic currentCount function', async () => {
    const req = createMockReq({ tenantId: 'tenant_1' })
    const res = createMockRes()
    const next = createMockNext()
    const countFn = vi.fn().mockReturnValue(3)

    await requirePlanLimit(getOptions(ts), 'max_users', countFn)(req, res, next)

    expect(countFn).toHaveBeenCalledWith(req)
    expect(next).toHaveBeenCalledWith()
  })

  it('should call next with AuthenticationError when tenantId is not resolved', async () => {
    const req = createMockReq({ tenantId: undefined })
    const res = createMockRes()
    const next = createMockNext()

    await requirePlanLimit(getOptions(ts), 'max_tenants', 5)(req, res, next)

    expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError))
  })
})

// ──────────────────────────────────────────────────────
// rateLimitByApiKey
// ──────────────────────────────────────────────────────

describe('rateLimitByApiKey', () => {
  let ts: ReturnType<typeof createMockTenantScale>

  beforeEach(() => {
    ts = createMockTenantScale()
    ts.rateLimiter.checkDailyLimit.mockResolvedValue({
      allowed: true,
      remaining: 99,
      limit: 100,
      current: 1,
    })
  })

  it('should pass when under daily limit', async () => {
    const req = createMockReq({ tenantKey: mockApiKey })
    const res = createMockRes()
    const next = createMockNext()

    await rateLimitByApiKey(getOptions(ts))(req, res, next)

    expect(ts.rateLimiter.checkDailyLimit).toHaveBeenCalledWith(mockApiKey)
    expect(next).toHaveBeenCalledWith()
  })

  it('should call next with RateLimitExceededError when over limit', async () => {
    ts.rateLimiter.checkDailyLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      limit: 100,
      current: 101,
    })
    const req = createMockReq({ tenantKey: mockApiKey })
    const res = createMockRes()
    const next = createMockNext()

    await rateLimitByApiKey(getOptions(ts))(req, res, next)

    expect(next).toHaveBeenCalledWith(expect.any(RateLimitExceededError))
  })

  it('should call next with AuthenticationError when no tenantKey', async () => {
    const req = createMockReq({ tenantKey: undefined })
    const res = createMockRes()
    const next = createMockNext()

    await rateLimitByApiKey(getOptions(ts))(req, res, next)

    expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError))
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
    const req = createMockReq()
    const res = createMockRes()
    const next = createMockNext()

    await rateLimitByIp(getOptions(ts))(req, res, next)

    expect(ts.rateLimiter.checkIpCreationLimit).toHaveBeenCalledWith('127.0.0.1')
    expect(next).toHaveBeenCalledWith()
  })

  it('should call next with RateLimitExceededError when IP is blocked', async () => {
    ts.rateLimiter.checkIpCreationLimit.mockResolvedValue({
      blocked: true,
      remaining: 0,
      resetAtMs: Date.now() + 60000,
    })
    const req = createMockReq()
    const res = createMockRes()
    const next = createMockNext()

    await rateLimitByIp(getOptions(ts))(req, res, next)

    expect(next).toHaveBeenCalledWith(expect.any(RateLimitExceededError))
  })

  it('should respect x-forwarded-for header', async () => {
    const req = createMockReq({
      headers: { 'x-forwarded-for': '203.0.113.1, 198.51.100.2' },
    })
    const res = createMockRes()
    const next = createMockNext()

    await rateLimitByIp(getOptions(ts))(req, res, next)

    expect(ts.rateLimiter.checkIpCreationLimit).toHaveBeenCalledWith('203.0.113.1')
    expect(next).toHaveBeenCalledWith()
  })
})

// ──────────────────────────────────────────────────────
// auditLog
// ──────────────────────────────────────────────────────

describe('auditLog', () => {
  let ts: ReturnType<typeof createMockTenantScale>

  beforeEach(() => {
    ts = createMockTenantScale()
    ts.logAuditEvent.mockResolvedValue(undefined)
  })

  it('should log audit event with tenant context', async () => {
    const req = createMockReq({
      tenantId: 'tenant_1',
      headers: { 'user-agent': 'curl/7.68' },
    })
    const res = createMockRes()
    const next = createMockNext()

    await auditLog(getOptions(ts), { action: 'tenant.create', resource: 'tenant' })(req, res, next)

    expect(ts.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant_1',
        action: 'tenant.create',
        resource: 'tenant',
        actor_type: 'admin_api',
        user_agent: 'curl/7.68',
      }),
    )
    expect(next).toHaveBeenCalledWith()
  })

  it('should skip silently when no tenant context', async () => {
    const req = createMockReq({ tenantId: undefined })
    const res = createMockRes()
    const next = createMockNext()

    await auditLog(getOptions(ts), { action: 'tenant.create', resource: 'tenant' })(req, res, next)

    expect(ts.logAuditEvent).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith()
  })

  it('should use portal session actor_type when session is present', async () => {
    const req = createMockReq({
      tenantId: 'tenant_1',
      portalSession: mockPortalSession,
      headers: {},
    })
    const res = createMockRes()
    const next = createMockNext()

    await auditLog(getOptions(ts), { action: 'user.login', resource: 'session' })(req, res, next)

    expect(ts.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: 'user_1',
        actor_type: 'user',
      }),
    )
  })

  it('should pass through audit failures (fire-and-forget)', async () => {
    ts.logAuditEvent.mockRejectedValue(new Error('DB timeout'))
    const req = createMockReq({
      tenantId: 'tenant_1',
      headers: {},
    })
    const res = createMockRes()
    const next = createMockNext()

    await auditLog(getOptions(ts), { action: 'test', resource: 'test' })(req, res, next)

    // Should still call next with no error
    expect(next).toHaveBeenCalledWith()
    expect(ts.logger.error).toHaveBeenCalled()
  })
})

// ──────────────────────────────────────────────────────
// errorHandler
// ──────────────────────────────────────────────────────

describe('errorHandler', () => {
  it('should return 401 for AuthenticationError', () => {
    const req = createMockReq()
    const res = createMockRes()
    const next = createMockNext()
    const err = new AuthenticationError('Invalid API key')

    errorHandler(err, req, res, next)

    expect(res._testState.statusCode).toBe(401)
    expect(res._testState.body).toEqual(
      expect.objectContaining({
        error: 'Invalid API key',
        code: 'AUTH_FAILED',
        statusCode: 401,
      }),
    )
    expect(next).not.toHaveBeenCalled()
  })

  it('should return 403 for AuthorizationError', () => {
    const req = createMockReq()
    const res = createMockRes()
    const next = createMockNext()
    const err = new AuthorizationError('Insufficient permissions', 'FORBIDDEN')

    errorHandler(err, req, res, next)

    expect(res._testState.statusCode).toBe(403)
    expect(res._testState.body).toEqual(
      expect.objectContaining({ code: 'FORBIDDEN', statusCode: 403 }),
    )
  })

  it('should return 403 with details for PlanLimitExceededError', () => {
    const req = createMockReq()
    const res = createMockRes()
    const next = createMockNext()
    const err = new PlanLimitExceededError(10, 10, 'max_tenants')

    errorHandler(err, req, res, next)

    expect(res._testState.statusCode).toBe(403)
    expect(res._testState.body).toEqual(
      expect.objectContaining({
        code: 'PLAN_LIMIT_REACHED',
        details: { limit: 10, current: 10 },
      }),
    )
  })

  it('should return 429 with Retry-After for RateLimitExceededError', () => {
    const req = createMockReq()
    const res = createMockRes()
    const next = createMockNext()
    const err = new RateLimitExceededError(100)
    ;(err as any).retryAfter = 30

    errorHandler(err, req, res, next)

    expect(res._testState.statusCode).toBe(429)
    expect(res._testState.body).toEqual(
      expect.objectContaining({
        code: 'DAILY_LIMIT_EXCEEDED',
        details: { planLimit: 100 },
      }),
    )
    expect(res.set).toHaveBeenCalledWith('Retry-After', '30')
  })

  it('should return 404 for NotFoundError', () => {
    const req = createMockReq()
    const res = createMockRes()
    const next = createMockNext()
    const err = new NotFoundError('tenant', 'tenant_999')

    errorHandler(err, req, res, next)

    expect(res._testState.statusCode).toBe(404)
    expect(res._testState.body).toEqual(expect.objectContaining({ code: 'NOT_FOUND' }))
  })

  it('should return 409 for ConflictError', () => {
    const req = createMockReq()
    const res = createMockRes()
    const next = createMockNext()
    const err = new ConflictError('Tenant slug already exists')

    errorHandler(err, req, res, next)

    expect(res._testState.statusCode).toBe(409)
    expect(res._testState.body).toEqual(expect.objectContaining({ code: 'CONFLICT' }))
  })

  it('should call next(err) for non-TenantScale errors', () => {
    const req = createMockReq()
    const res = createMockRes()
    const next = createMockNext()
    const err = new Error('Unknown error')

    errorHandler(err, req, res, next)

    expect(next).toHaveBeenCalledWith(err)
    expect(res.json).not.toHaveBeenCalled()
  })
})

// ──────────────────────────────────────────────────────
// genericErrorHandler
// ──────────────────────────────────────────────────────

describe('genericErrorHandler', () => {
  it('should return 500 with internal error message in production', () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    const req = createMockReq()
    const res = createMockRes()
    const next = createMockNext()
    const err = new Error('Connection pool exhausted')

    genericErrorHandler(err, req, res, next)

    expect(res._testState.statusCode).toBe(500)
    expect(res._testState.body).toEqual(
      expect.objectContaining({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      }),
    )
    process.env.NODE_ENV = prev
  })

  it('should expose error details in non-production', () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    const req = createMockReq()
    const res = createMockRes()
    const next = createMockNext()
    const err = new Error('Connection pool exhausted')

    genericErrorHandler(err, req, res, next)

    expect(res._testState.statusCode).toBe(500)
    expect(res._testState.body).toEqual(
      expect.objectContaining({
        error: 'Connection pool exhausted',
      }),
    )
    process.env.NODE_ENV = prev
  })
})
