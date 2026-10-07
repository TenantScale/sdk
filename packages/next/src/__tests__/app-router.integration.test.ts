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
// @tenantscale/next — App Router Integration Tests
// ──────────────────────────────────────────────────────
//
// REAL integration tests using next-test-api-route-handler.
// These tests run against actual Next.js App Router environment
// with real cookies() and headers() functions - NO MOCKS.

import { testApiHandler } from 'next-test-api-route-handler' // Must be first import
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAppRouterHandler } from '../app-router.js'
import { requireScope, requirePlanLimit, rateLimitByApiKey, auditLog } from '../middleware.js'

// ── Mock TenantScale instance for integration testing ──
// We mock the SDK to avoid real Supabase calls, but test the real Next.js environment

const mockTs = {
  validateSession: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
} as any

// ──────────────────────────────────────────────────────
// Integration Test Suite
// ──────────────────────────────────────────────────────

describe('App Router Integration Tests (Real Next.js Environment)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Happy Path Tests ──

  describe('Real cookies() Integration', () => {
    it('should read session tokens from real cookies() and expose tenant context', async () => {
      const mockSession = {
        user_id: 'user_1',
        email: 'admin@test.com',
        tenant_id: 'tenant_1',
        tenant_slug: 'test-org',
        tenant_name: 'Test Org',
        role: 'admin',
        membership_id: 'mem_1',
        is_super_admin: false,
      }

      mockTs.validateSession = vi.fn().mockResolvedValue(mockSession)

      const handlerFactory = createAppRouterHandler({ ts: mockTs })

      await testApiHandler({
        appHandler: {
          dynamic: 'force-dynamic',
          async GET(_request) {
            const routeHandler = handlerFactory.withSession(async (req, { session, tenantId }) => {
              return Response.json({
                email: session.email,
                tenantId,
                role: session.role,
                tenantName: session.tenant_name,
              })
            })
            return routeHandler(_request, { params: Promise.resolve({}) })
          },
        },
        requestPatcher(req) {
          req.cookies.set('tenant_session', 'valid_jwt_token_123')
        },
        async test({ fetch }) {
          const res = await fetch()
          expect(res.status).toBe(200)
          const body = await res.json()
          expect(body).toEqual({
            email: 'admin@test.com',
            tenantId: 'tenant_1',
            role: 'admin',
            tenantName: 'Test Org',
          })
          expect(mockTs.validateSession).toHaveBeenCalledWith('valid_jwt_token_123')
        },
      })
    })

    it('should handle platform-level sessions with null tenant_id', async () => {
      const mockPlatformSession = {
        user_id: 'super_admin',
        email: 'super@tenantscale.com',
        tenant_id: null,
        tenant_slug: null,
        tenant_name: 'TenantScale Platform',
        role: 'super_admin',
        membership_id: 'platform_mem',
        is_super_admin: true,
      }

      mockTs.validateSession = vi.fn().mockResolvedValue(mockPlatformSession)

      const handlerFactory = createAppRouterHandler({ ts: mockTs })

      await testApiHandler({
        appHandler: {
          dynamic: 'force-dynamic',
          async GET(_request) {
            const routeHandler = handlerFactory.withSession(async (req, { session, tenantId }) => {
              return Response.json({
                isSuperAdmin: session.is_super_admin,
                tenantId,
                email: session.email,
              })
            })
            return routeHandler(_request, { params: Promise.resolve({}) })
          },
        },
        requestPatcher(req) {
          req.cookies.set('tenant_session', 'platform_jwt_token')
        },
        async test({ fetch }) {
          const res = await fetch()
          expect(res.status).toBe(200)
          const body = await res.json()
          expect(body.tenantId).toBeNull()
          expect(body.isSuperAdmin).toBe(true)
          expect(body.email).toBe('super@tenantscale.com')
        },
      })
    })

    it('should handle POST requests with request body', async () => {
      const mockSession = {
        user_id: 'user_1',
        email: 'admin@test.com',
        tenant_id: 'tenant_1',
        tenant_slug: 'test-org',
        tenant_name: 'Test Org',
        role: 'admin',
        membership_id: 'mem_1',
        is_super_admin: false,
      }

      mockTs.validateSession = vi.fn().mockResolvedValue(mockSession)

      const handlerFactory = createAppRouterHandler({ ts: mockTs })

      await testApiHandler({
        appHandler: {
          dynamic: 'force-dynamic',
          async POST(_request) {
            const routeHandler = handlerFactory.withSession(async (req, { session, tenantId }) => {
              const body = await req.json()
              return Response.json({
                tenantId,
                userEmail: session.email,
                receivedData: body,
              })
            })
            return routeHandler(_request, { params: Promise.resolve({}) })
          },
        },
        requestPatcher(req) {
          req.cookies.set('tenant_session', 'valid_jwt')
        },
        async test({ fetch }) {
          const res = await fetch({
            method: 'POST',
            body: JSON.stringify({ name: 'New Tenant', slug: 'new-tenant' }),
          })
          expect(res.status).toBe(200)
          const body = await res.json()
          expect(body.tenantId).toBe('tenant_1')
          expect(body.receivedData).toEqual({ name: 'New Tenant', slug: 'new-tenant' })
        },
      })
    })
  })

  // ── Error Handling Tests ──

  describe('Error Handling with Real cookies()', () => {
    it('should return 401 when tenant_session cookie is missing', async () => {
      const handlerFactory = createAppRouterHandler({ ts: mockTs })

      await testApiHandler({
        appHandler: {
          dynamic: 'force-dynamic',
          async GET(_request) {
            const routeHandler = handlerFactory.withSession(async () => {
              return Response.json({ message: 'should not reach' })
            })
            return routeHandler(_request, { params: Promise.resolve({}) })
          },
        },
        async test({ fetch }) {
          const res = await fetch()
          expect(res.status).toBe(401)
          const body = await res.json()
          expect(body).toEqual({
            error: 'Missing tenant_session cookie',
            code: 'AUTH_FAILED',
            statusCode: 401,
          })
          expect(mockTs.validateSession).not.toHaveBeenCalled()
        },
      })
    })

    it('should return 401 when session token is invalid', async () => {
      const { AuthenticationError } = await import('@tenantscale/sdk')
      mockTs.validateSession = vi
        .fn()
        .mockRejectedValue(
          new AuthenticationError('Invalid or expired session token', 'INVALID_SESSION'),
        )

      const handlerFactory = createAppRouterHandler({ ts: mockTs })

      await testApiHandler({
        appHandler: {
          dynamic: 'force-dynamic',
          async GET(_request) {
            const routeHandler = handlerFactory.withSession(async () => {
              return Response.json({ message: 'should not reach' })
            })
            return routeHandler(_request, { params: Promise.resolve({}) })
          },
        },
        requestPatcher(req) {
          req.cookies.set('tenant_session', 'invalid_jwt_token')
        },
        async test({ fetch }) {
          const res = await fetch()
          expect(res.status).toBe(401)
          const body = await res.json()
          expect(body.code).toBe('INVALID_SESSION')
          expect(body.error).toBe('Invalid or expired session token')
          expect(mockTs.validateSession).toHaveBeenCalledWith('invalid_jwt_token')
        },
      })
    })
  })

  // ── Request Context Tests ──

  describe('Request Context with Real Next.js Environment', () => {
    it('should preserve request headers in handler', async () => {
      const mockSession = {
        user_id: 'user_1',
        email: 'admin@test.com',
        tenant_id: 'tenant_1',
        tenant_slug: 'test-org',
        tenant_name: 'Test Org',
        role: 'admin',
        membership_id: 'mem_1',
        is_super_admin: false,
      }

      mockTs.validateSession = vi.fn().mockResolvedValue(mockSession)

      const handlerFactory = createAppRouterHandler({ ts: mockTs })

      await testApiHandler({
        appHandler: {
          dynamic: 'force-dynamic',
          async GET(_request) {
            const routeHandler = handlerFactory.withSession(async (req, { tenantId }) => {
              const userAgent = req.headers.get('user-agent')
              const customHeader = req.headers.get('x-custom-header')
              return Response.json({
                tenantId,
                userAgent,
                customHeader,
              })
            })
            return routeHandler(_request, { params: Promise.resolve({}) })
          },
        },
        requestPatcher(req) {
          req.cookies.set('tenant_session', 'valid_jwt')
          req.headers.set('x-custom-header', 'test-value')
          req.headers.set('user-agent', 'TestAgent/1.0')
        },
        async test({ fetch }) {
          const res = await fetch()
          expect(res.status).toBe(200)
          const body = await res.json()
          expect(body.userAgent).toBe('TestAgent/1.0')
          expect(body.customHeader).toBe('test-value')
        },
      })
    })

    it('should handle different HTTP methods', async () => {
      const mockSession = {
        user_id: 'user_1',
        email: 'admin@test.com',
        tenant_id: 'tenant_1',
        tenant_slug: 'test-org',
        tenant_name: 'Test Org',
        role: 'admin',
        membership_id: 'mem_1',
        is_super_admin: false,
      }

      mockTs.validateSession = vi.fn().mockResolvedValue(mockSession)

      const handlerFactory = createAppRouterHandler({ ts: mockTs })

      // Test GET
      await testApiHandler({
        appHandler: {
          dynamic: 'force-dynamic',
          async GET(_request) {
            const routeHandler = handlerFactory.withSession(async (req) => {
              return Response.json({ method: req.method })
            })
            return routeHandler(_request, { params: Promise.resolve({}) })
          },
        },
        requestPatcher(req) {
          req.cookies.set('tenant_session', 'valid_jwt')
        },
        async test({ fetch }) {
          const res = await fetch({ method: 'GET' })
          expect(await res.json()).toEqual({ method: 'GET' })
        },
      })

      // Test POST
      await testApiHandler({
        appHandler: {
          dynamic: 'force-dynamic',
          async POST(_request) {
            const routeHandler = handlerFactory.withSession(async (req) => {
              return Response.json({ method: req.method })
            })
            return routeHandler(_request, { params: Promise.resolve({}) })
          },
        },
        requestPatcher(req) {
          req.cookies.set('tenant_session', 'valid_jwt')
        },
        async test({ fetch }) {
          const res = await fetch({ method: 'POST' })
          expect(await res.json()).toEqual({ method: 'POST' })
        },
      })
    })
  })
})

// ──────────────────────────────────────────────────────
// Middleware Integration (real Next.js App Router environment)
// ──────────────────────────────────────────────────────

describe('Middleware Integration (Real Next.js Environment)', () => {
  const middlewareTs = {
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
  } as any

  const apiKey = {
    raw: 'tk_int_abc',
    tenant_id: 'tenant_1',
    scopes: ['admin', 'read'],
    created_by: 'user_1',
    key_record_id: 'key_1',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('protects a route with requireScope using real headers() + x-api-key', async () => {
    middlewareTs.validateApiKey.mockResolvedValue(apiKey)
    await testApiHandler({
      appHandler: {
        dynamic: 'force-dynamic',
        async GET(_request) {
          const wrapped = requireScope(
            { ts: middlewareTs },
            'admin',
          )(async () => Response.json({ ok: true }))
          return wrapped(_request, { params: Promise.resolve({}) })
        },
      },
      requestPatcher(req) {
        req.headers.set('x-api-key', 'tk_int_abc')
      },
      async test({ fetch }) {
        const res = await fetch()
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true })
        expect(middlewareTs.requireScope).toHaveBeenCalledWith(apiKey, 'admin')
      },
    })
  })

  it('enforces a plan limit through a real route and returns a JSON error', async () => {
    middlewareTs.validateApiKey.mockResolvedValue(apiKey)
    middlewareTs.plans.getPlanLimit.mockResolvedValue(3)
    await testApiHandler({
      appHandler: {
        dynamic: 'force-dynamic',
        async GET(_request) {
          const wrapped = requirePlanLimit(
            { ts: middlewareTs },
            'max_tenants',
            3,
          )(async () => Response.json({ ok: true }))
          return wrapped(_request, { params: Promise.resolve({}) })
        },
      },
      requestPatcher(req) {
        req.headers.set('x-api-key', 'tk_int_abc')
      },
      async test({ fetch }) {
        const res = await fetch()
        expect(res.status).toBe(403)
        const body = await res.json()
        expect(body.code).toBe('PLAN_LIMIT_REACHED')
      },
    })
  })

  it('rate-limits by API key and sets response headers through a real route', async () => {
    middlewareTs.validateApiKey.mockResolvedValue(apiKey)
    middlewareTs.rateLimiter.checkDailyLimit.mockResolvedValue({
      allowed: true,
      remaining: 42,
      limit: 100,
    })
    await testApiHandler({
      appHandler: {
        dynamic: 'force-dynamic',
        async GET(_request) {
          const wrapped = rateLimitByApiKey({ ts: middlewareTs })(async () =>
            Response.json({ ok: true }),
          )
          return wrapped(_request, { params: Promise.resolve({}) })
        },
      },
      requestPatcher(req) {
        req.headers.set('x-api-key', 'tk_int_abc')
      },
      async test({ fetch }) {
        const res = await fetch()
        expect(res.status).toBe(200)
        expect(res.headers.get('X-RateLimit-Limit-Daily')).toBe('100')
        expect(res.headers.get('X-RateLimit-Remaining-Daily')).toBe('42')
      },
    })
  })

  it('logs an audit event and still succeeds through the real route', async () => {
    middlewareTs.validateApiKey.mockResolvedValue(apiKey)
    await testApiHandler({
      appHandler: {
        dynamic: 'force-dynamic',
        async GET(_request) {
          const wrapped = auditLog(
            { ts: middlewareTs },
            { action: 'tenant.list', resource: '/api/tenants' },
          )(async () => Response.json({ ok: true }))
          return wrapped(_request, { params: Promise.resolve({}) })
        },
      },
      requestPatcher(req) {
        req.headers.set('x-api-key', 'tk_int_abc')
      },
      async test({ fetch }) {
        const res = await fetch()
        expect(res.status).toBe(200)
        expect(middlewareTs.logAuditEvent).toHaveBeenCalled()
      },
    })
  })
})
