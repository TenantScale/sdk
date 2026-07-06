// ──────────────────────────────────────────────────────
// @tenantscale/next — Tests
// ──────────────────────────────────────────────────────
//
// Tests authenticate functions, handler wrappers, and error helper.
// Uses standard Request objects (NextRequest extends Request).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import { cookies } from 'next/headers'
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
  requirePortalSession,
} from '../authenticate.js'
import {
  createHandler,
  withApiKey,
  withSession,
} from '../handler.js'
import {
  errorResponse,
} from '../error-handler.js'
import { createAppRouterHandler } from '../app-router.js'

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}))

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

function createMockRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/test', { headers })
}

const mockRouteParams = { params: Promise.resolve({ id: 'tenant_1' }) }

// ──────────────────────────────────────────────────────
// authenticateApiKey (raw function)
// ──────────────────────────────────────────────────────

describe('authenticateApiKey', () => {
  let ts: ReturnType<typeof createMockTenantScale>

  beforeEach(() => {
    ts = createMockTenantScale()
    ts.validateApiKey.mockResolvedValue(mockApiKey)
  })

  it('should validate API key from x-api-key header', async () => {
    const req = createMockRequest({ 'x-api-key': 'tk_test_abc' })
    const result = await authenticateApiKey(req, { ts })

    expect(ts.validateApiKey).toHaveBeenCalledWith('tk_test_abc')
    expect(result.apiKey).toEqual(mockApiKey)
    expect(result.tenantId).toBe('tenant_1')
  })

  it('should use custom header name from options', async () => {
    const req = createMockRequest({ 'x-api-token': 'tk_test_abc' })
    const result = await authenticateApiKey(req, { ts, apiKeyHeader: 'x-api-token' })

    expect(ts.validateApiKey).toHaveBeenCalledWith('tk_test_abc')
    expect(result.apiKey).toEqual(mockApiKey)
  })

  it('should throw AuthenticationError when header is missing', async () => {
    const req = createMockRequest({})
    await expect(authenticateApiKey(req, { ts })).rejects.toThrow(AuthenticationError)
    expect(ts.validateApiKey).not.toHaveBeenCalled()
  })

  it('should throw when validateApiKey fails', async () => {
    ts.validateApiKey.mockRejectedValue(new AuthenticationError('Invalid key'))
    const req = createMockRequest({ 'x-api-key': 'tk_bad' })
    await expect(authenticateApiKey(req, { ts })).rejects.toThrow(AuthenticationError)
  })
})

// ──────────────────────────────────────────────────────
// requirePortalSession (raw function)
// ──────────────────────────────────────────────────────

describe('requirePortalSession', () => {
  let ts: ReturnType<typeof createMockTenantScale>

  beforeEach(() => {
    ts = createMockTenantScale()
    ts.validateSession.mockResolvedValue(mockPortalSession)
  })

  it('should validate Bearer JWT from Authorization header', async () => {
    const req = createMockRequest({ authorization: 'Bearer jwt_token_123' })
    const result = await requirePortalSession(req, { ts })

    expect(ts.validateSession).toHaveBeenCalledWith('jwt_token_123')
    expect(result.session).toEqual(mockPortalSession)
    expect(result.tenantId).toBe('tenant_1')
  })

  it('should return null tenantId for platform-level sessions', async () => {
    ts.validateSession.mockResolvedValue({ ...mockPortalSession, tenant_id: null })
    const req = createMockRequest({ authorization: 'Bearer jwt_no_tenant' })
    const result = await requirePortalSession(req, { ts })

    expect(result.tenantId).toBeNull()
  })

  it('should throw AuthenticationError when header is missing', async () => {
    const req = createMockRequest({})
    await expect(requirePortalSession(req, { ts })).rejects.toThrow(AuthenticationError)
  })

  it('should throw AuthenticationError for non-Bearer format', async () => {
    const req = createMockRequest({ authorization: 'Basic dXNlcjpwYXNz' })
    await expect(requirePortalSession(req, { ts })).rejects.toThrow(AuthenticationError)
  })

  it('should throw AuthenticationError for malformed Bearer token', async () => {
    const req = createMockRequest({ authorization: 'Bearer' })
    await expect(requirePortalSession(req, { ts })).rejects.toThrow(AuthenticationError)
  })
})

// ──────────────────────────────────────────────────────
// withApiKey (handler wrapper)
// ──────────────────────────────────────────────────────

describe('withApiKey', () => {
  let ts: ReturnType<typeof createMockTenantScale>

  beforeEach(() => {
    ts = createMockTenantScale()
    ts.validateApiKey.mockResolvedValue(mockApiKey)
  })

  it('should return 200 with handler response', async () => {
    const handler = withApiKey({ ts }, async (req, { apiKey, tenantId }) => {
      return new Response(JSON.stringify({ tenantId, scopes: apiKey.scopes }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const req = createMockRequest({ 'x-api-key': 'tk_test_abc' })
    const res = await handler(req, mockRouteParams)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ tenantId: 'tenant_1', scopes: ['admin', 'read'] })
  })

  it('should return 401 when API key is missing', async () => {
    const handler = withApiKey({ ts }, async () => {
      return new Response('should not reach here', { status: 200 })
    })

    const req = createMockRequest({})
    const res = await handler(req, mockRouteParams)

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.code).toBe('AUTH_FAILED')
  })

  it('should forward route params', async () => {
    const handler = withApiKey({ ts }, async (req, context, { params }) => {
      const { id } = await params
      return new Response(JSON.stringify({ id, tenantId: context.tenantId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const req = createMockRequest({ 'x-api-key': 'tk_test_abc' })
    const res = await handler(req, mockRouteParams)
    const body = await res.json()

    expect(body).toEqual({ id: 'tenant_1', tenantId: 'tenant_1' })
  })
})

// ──────────────────────────────────────────────────────
// withSession (handler wrapper)
// ──────────────────────────────────────────────────────

describe('withSession', () => {
  let ts: ReturnType<typeof createMockTenantScale>

  beforeEach(() => {
    ts = createMockTenantScale()
    ts.validateSession.mockResolvedValue(mockPortalSession)
  })

  it('should return 200 with handler response', async () => {
    const handler = withSession({ ts }, async (req, { session }) => {
      return new Response(JSON.stringify({ email: session.email, role: session.role }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const req = createMockRequest({ authorization: 'Bearer jwt_valid' })
    const res = await handler(req, mockRouteParams)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ email: 'admin@test.com', role: 'admin' })
  })

  it('should return 401 when auth header is missing', async () => {
    const handler = withSession({ ts }, async () => {
      return new Response('should not reach', { status: 200 })
    })

    const req = createMockRequest({})
    const res = await handler(req, mockRouteParams)

    expect(res.status).toBe(401)
  })
})

// ──────────────────────────────────────────────────────
// createHandler (factory)
// ──────────────────────────────────────────────────────

describe('createAppRouterHandler', () => {
  let ts: ReturnType<typeof createMockTenantScale>

  beforeEach(() => {
    ts = createMockTenantScale()
    ts.validateSession.mockResolvedValue(mockPortalSession)
    vi.mocked(cookies).mockReset()
  })

  it('should read session tokens from cookies and expose tenant context', async () => {
    const cookieStore = {
      get: vi.fn().mockReturnValue({ name: 'tenant_session', value: 'jwt_valid' }),
    }
    vi.mocked(cookies).mockResolvedValue(cookieStore as any)

    const h = createAppRouterHandler({ ts })
    const routeHandler = h.withSession(async (_request, { session, tenantId }) => {
      return new Response(JSON.stringify({ email: session.email, tenantId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const res = await routeHandler(createMockRequest(), mockRouteParams)
    expect(res.status).toBe(200)
    expect(cookieStore.get).toHaveBeenCalledWith('tenant_session')
    expect(ts.validateSession).toHaveBeenCalledWith('jwt_valid')
    const body = await res.json()
    expect(body).toEqual({ email: 'admin@test.com', tenantId: 'tenant_1' })
  })

  it('should return a 401 response when the tenant session cookie is missing', async () => {
    const cookieStore = {
      get: vi.fn().mockReturnValue(undefined),
    }
    vi.mocked(cookies).mockResolvedValue(cookieStore as any)

    const h = createAppRouterHandler({ ts })
    const routeHandler = h.withSession(async () => {
      return new Response('should not reach here', { status: 200 })
    })

    const res = await routeHandler(createMockRequest(), mockRouteParams)
    expect(res.status).toBe(401)
    expect(ts.validateSession).not.toHaveBeenCalled()
    const body = await res.json()
    expect(body).toEqual({
      error: 'Missing tenant_session cookie',
      code: 'AUTH_FAILED',
      statusCode: 401,
    })
  })
})

describe('createHandler', () => {
  let ts: ReturnType<typeof createMockTenantScale>

  beforeEach(() => {
    ts = createMockTenantScale()
  })

  it('should create a factory with withApiKey and withSession', () => {
    const h = createHandler({ ts })
    expect(typeof h.withApiKey).toBe('function')
    expect(typeof h.withSession).toBe('function')
  })

  it('should reuse the same adapter options across methods', async () => {
    ts.validateApiKey.mockResolvedValue(mockApiKey)
    ts.validateSession.mockResolvedValue(mockPortalSession)

    const h = createHandler({ ts })

    const apiHandler = h.withApiKey(async (req, { tenantId }) => {
      return new Response(JSON.stringify({ from: 'api', tenantId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const sessionHandler = h.withSession(async (req, { session }) => {
      return new Response(JSON.stringify({ from: 'session', email: session.email }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const apiRes = await apiHandler(
      createMockRequest({ 'x-api-key': 'tk_test' }),
      mockRouteParams,
    )
    expect(await apiRes.json()).toEqual({ from: 'api', tenantId: 'tenant_1' })

    const sessionRes = await sessionHandler(
      createMockRequest({ authorization: 'Bearer jwt_test' }),
      mockRouteParams,
    )
    expect(await sessionRes.json()).toEqual({ from: 'session', email: 'admin@test.com' })
  })
})

// ──────────────────────────────────────────────────────
// errorResponse
// ──────────────────────────────────────────────────────

describe('errorResponse', () => {
  it('should return 401 for AuthenticationError', async () => {
    const err = new AuthenticationError('Invalid API key', 'AUTH_FAILED')
    const res = errorResponse(err)

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({
      error: 'Invalid API key',
      code: 'AUTH_FAILED',
      statusCode: 401,
    })
  })

  it('should return 403 for AuthorizationError', async () => {
    const err = new AuthorizationError('Forbidden')
    const res = errorResponse(err)

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.statusCode).toBe(403)
  })

  it('should return 403 with details for PlanLimitExceededError', async () => {
    const err = new PlanLimitExceededError(10, 10, 'max_tenants')
    const res = errorResponse(err)

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.details).toEqual({ limit: 10, current: 10 })
  })

  it('should return 429 with Retry-After header for RateLimitExceededError', async () => {
    const err = new RateLimitExceededError(100)
    ;(err as any).retryAfter = 30
    const res = errorResponse(err)

    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('30')
    const body = await res.json()
    expect(body.details).toEqual({ planLimit: 100 })
  })

  it('should return 404 for NotFoundError', async () => {
    const err = new NotFoundError('tenant', 't_999')
    const res = errorResponse(err)

    expect(res.status).toBe(404)
  })

  it('should return 409 for ConflictError', async () => {
    const err = new ConflictError('Duplicate slug')
    const res = errorResponse(err)

    expect(res.status).toBe(409)
  })

  it('should return 500 with hidden details in production', async () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'

    const res = errorResponse(new Error('Database connection failed'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Internal server error')
    expect(body.code).toBe('INTERNAL_ERROR')

    process.env.NODE_ENV = prev
  })

  it('should return 500 with details in non-production', async () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'

    const res = errorResponse(new Error('Connection pool exhausted'))
    const body = await res.json()
    expect(body.error).toBe('Internal error (check server logs)')

    process.env.NODE_ENV = prev
  })
})
