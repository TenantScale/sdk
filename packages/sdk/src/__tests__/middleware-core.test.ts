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
// Middleware Core — Unit Tests
// ──────────────────────────────────────────────────────
//
// Framework-agnostic middleware logic shared by every adapter
// (Express, Fastify, Hono, Koa). These tests exercise the
// business rules directly with a stubbed TenantScale instance,
// independent of any HTTP framework.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ApiKeyInfo, PortalSessionInfo } from '../types.js'
import type { TenantScale } from '../index.js'
import {
  authenticateApiKeyCore,
  requireScopeCore,
  requirePortalSessionCore,
  requirePortalRoleCore,
  requireSuperAdminCore,
  requirePlanLimitCore,
  rateLimitByApiKeyCore,
  rateLimitByIpCore,
  auditLogCore,
} from '../middleware-core.js'

// ── Fixtures ──

function apiKeyInfo(overrides?: Partial<ApiKeyInfo>): ApiKeyInfo {
  return {
    raw: 'tk_test_raw',
    tenant_id: 'tenant_acme',
    scopes: ['read', 'write'],
    created_by: 'user_owner',
    key_record_id: 'key_rec_1',
    ...overrides,
  }
}

function portalSession(overrides?: Partial<PortalSessionInfo>): PortalSessionInfo {
  return {
    user_id: 'user_42',
    email: 'owner@acme.test',
    tenant_id: 'tenant_acme',
    tenant_slug: 'acme',
    tenant_name: 'Acme Inc',
    role: 'owner',
    membership_id: 'membership_1',
    is_super_admin: false,
    ...overrides,
  }
}

/**
 * Minimal stub of the TenantScale facade that exposes only the
 * collaborators the middleware-core functions touch. Every method is
 * a vi.fn so tests can assert delegation and configure return values.
 */
function makeTs() {
  const ts = {
    logger: {
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    },
    validateApiKey: vi.fn(),
    validateSession: vi.fn(),
    requireScope: vi.fn(),
    requirePortalRole: vi.fn(),
    requireSuperAdmin: vi.fn(),
    logAuditEvent: vi.fn().mockResolvedValue(undefined),
    plans: {
      getPlanLimit: vi.fn(),
    },
    rateLimiter: {
      checkDailyLimit: vi.fn(),
      checkIpCreationLimit: vi.fn(),
    },
  }
  return ts as unknown as TenantScale & typeof ts
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ══════════════════════════════════════════════════════════
// API Key Authentication
// ══════════════════════════════════════════════════════════

describe('authenticateApiKeyCore', () => {
  it('throws AuthenticationError when the token is missing', async () => {
    const ts = makeTs()

    await expect(
      authenticateApiKeyCore(ts, undefined, 'X-Api-Key', false, { url: '/x' }),
    ).rejects.toThrow(/Missing X-Api-Key header/)
    expect(ts.validateApiKey).not.toHaveBeenCalled()
  })

  it('returns the resolved api key and tenant id', async () => {
    const ts = makeTs()
    ts.validateApiKey.mockResolvedValue(apiKeyInfo())

    const result = await authenticateApiKeyCore(ts, 'tk_test_raw', 'X-Api-Key', false, {
      url: '/x',
    })

    expect(ts.validateApiKey).toHaveBeenCalledWith('tk_test_raw')
    expect(result.tenantId).toBe('tenant_acme')
    expect(result.apiKey.tenant_id).toBe('tenant_acme')
  })

  it('writes an audit event on success when auditing is enabled', async () => {
    const ts = makeTs()
    ts.validateApiKey.mockResolvedValue(apiKeyInfo())

    await authenticateApiKeyCore(ts, 'tk_test_raw', 'X-Api-Key', true, {
      url: '/team',
      ip: '203.0.113.9',
      userAgent: 'vitest-agent',
    })

    expect(ts.logAuditEvent).toHaveBeenCalledTimes(1)
    expect(ts.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant_acme',
        actor_id: 'key_rec_1',
        actor_type: 'admin_api',
        action: 'api_key.authenticated',
        resource: '/team',
        ip: '203.0.113.9',
        user_agent: 'vitest-agent',
      }),
    )
  })

  it('does not audit when auditing is disabled', async () => {
    const ts = makeTs()
    ts.validateApiKey.mockResolvedValue(apiKeyInfo())

    await authenticateApiKeyCore(ts, 'tk_test_raw', 'X-Api-Key', false, { url: '/team' })

    expect(ts.logAuditEvent).not.toHaveBeenCalled()
  })

  it('does not throw when audit logging fails (fire-and-forget)', async () => {
    const ts = makeTs()
    ts.validateApiKey.mockResolvedValue(apiKeyInfo())
    ts.logAuditEvent.mockRejectedValue(new Error('db down'))

    await expect(
      authenticateApiKeyCore(ts, 'tk_test_raw', 'X-Api-Key', true, { url: '/team' }),
    ).resolves.toBeDefined()
  })
})

// ══════════════════════════════════════════════════════════
// Scope Enforcement
// ══════════════════════════════════════════════════════════

describe('requireScopeCore', () => {
  it('throws AuthenticationError when no api key is present', () => {
    const ts = makeTs()

    expect(() => requireScopeCore(ts, undefined, ['read'])).toThrow(/Authentication required/)
    expect(ts.requireScope).not.toHaveBeenCalled()
  })

  it('delegates the scope check to the SDK with all requested scopes', () => {
    const ts = makeTs()
    const apiKey = apiKeyInfo()

    requireScopeCore(ts, apiKey, ['read', 'write'])

    expect(ts.requireScope).toHaveBeenCalledWith(apiKey, 'read', 'write')
  })

  it('propagates the SDK authorization error unchanged', () => {
    const ts = makeTs()
    const err = new Error('forbidden')
    ts.requireScope.mockImplementation(() => {
      throw err
    })

    expect(() => requireScopeCore(ts, apiKeyInfo(), ['admin'])).toThrow(err)
  })
})

// ══════════════════════════════════════════════════════════
// Portal Session Authentication
// ══════════════════════════════════════════════════════════

describe('requirePortalSessionCore', () => {
  it('throws when the authorization header is missing', async () => {
    const ts = makeTs()

    await expect(requirePortalSessionCore(ts, undefined, 'Authorization')).rejects.toThrow(
      /Missing Authorization header/,
    )
  })

  it('throws when the header is not a Bearer token', async () => {
    const ts = makeTs()

    await expect(requirePortalSessionCore(ts, 'Basic abc', 'Authorization')).rejects.toThrow(
      /Expected: Bearer <token>/,
    )
  })

  it('throws when the Bearer token is empty', async () => {
    const ts = makeTs()

    await expect(requirePortalSessionCore(ts, 'Bearer ', 'Authorization')).rejects.toThrow(
      /Empty token/,
    )
  })

  it('returns the session and tenant id for a valid JWT', async () => {
    const ts = makeTs()
    ts.validateSession.mockResolvedValue(portalSession())

    const result = await requirePortalSessionCore(ts, 'Bearer jwt.token.here', 'Authorization')

    expect(ts.validateSession).toHaveBeenCalledWith('jwt.token.here')
    expect(result.tenantId).toBe('tenant_acme')
    expect(result.session.user_id).toBe('user_42')
  })

  it('returns a null tenant id for a session without a tenant', async () => {
    const ts = makeTs()
    ts.validateSession.mockResolvedValue(portalSession({ tenant_id: null, role: null }))

    const result = await requirePortalSessionCore(ts, 'Bearer jwt', 'Authorization')

    expect(result.tenantId).toBeNull()
  })
})

// ══════════════════════════════════════════════════════════
// Portal Role + Super Admin Enforcement
// ══════════════════════════════════════════════════════════

describe('requirePortalRoleCore', () => {
  it('throws AuthenticationError when no session is present', () => {
    const ts = makeTs()

    expect(() => requirePortalRoleCore(ts, undefined, ['owner'])).toThrow(/Portal session required/)
    expect(ts.requirePortalRole).not.toHaveBeenCalled()
  })

  it('delegates the role check to the SDK', () => {
    const ts = makeTs()
    const session = portalSession()

    requirePortalRoleCore(ts, session, ['owner', 'admin'])

    expect(ts.requirePortalRole).toHaveBeenCalledWith(session, 'owner', 'admin')
  })
})

describe('requireSuperAdminCore', () => {
  it('throws AuthenticationError when no session is present', () => {
    const ts = makeTs()

    expect(() => requireSuperAdminCore(ts, undefined)).toThrow(/Portal session required/)
    expect(ts.requireSuperAdmin).not.toHaveBeenCalled()
  })

  it('delegates the super-admin check to the SDK', () => {
    const ts = makeTs()
    const session = portalSession({ is_super_admin: true })

    requireSuperAdminCore(ts, session)

    expect(ts.requireSuperAdmin).toHaveBeenCalledWith(session)
  })
})

// ══════════════════════════════════════════════════════════
// Plan Limit Enforcement
// ══════════════════════════════════════════════════════════

describe('requirePlanLimitCore', () => {
  it('throws AuthenticationError when no tenant id is resolved', async () => {
    const ts = makeTs()

    await expect(requirePlanLimitCore(ts, undefined, 'seats', 1)).rejects.toThrow(
      /Tenant ID not resolved/,
    )
    expect(ts.plans.getPlanLimit).not.toHaveBeenCalled()
  })

  it('returns false (unlimited) when the plan limit is null', async () => {
    const ts = makeTs()
    ts.plans.getPlanLimit.mockResolvedValue(null)

    const allowed = await requirePlanLimitCore(ts, 'tenant_acme', 'seats', 999)

    expect(allowed).toBe(false)
  })

  it('returns true when the current count is under the limit', async () => {
    const ts = makeTs()
    ts.plans.getPlanLimit.mockResolvedValue(10)

    const allowed = await requirePlanLimitCore(ts, 'tenant_acme', 'seats', 9)

    expect(allowed).toBe(true)
  })

  it('accepts a lazy (async) current-count function', async () => {
    const ts = makeTs()
    ts.plans.getPlanLimit.mockResolvedValue(10)
    const currentCount = vi.fn().mockResolvedValue(3)

    const allowed = await requirePlanLimitCore(ts, 'tenant_acme', 'seats', currentCount)

    expect(currentCount).toHaveBeenCalledTimes(1)
    expect(allowed).toBe(true)
  })

  it('throws PlanLimitExceededError when the count hits the limit', async () => {
    const ts = makeTs()
    ts.plans.getPlanLimit.mockResolvedValue(10)

    await expect(requirePlanLimitCore(ts, 'tenant_acme', 'seats', 10)).rejects.toMatchObject({
      name: 'PlanLimitExceededError',
      limit: 10,
      current: 10,
      statusCode: 403,
      code: 'PLAN_LIMIT_REACHED',
    })
  })
})

// ══════════════════════════════════════════════════════════
// Rate Limiting
// ══════════════════════════════════════════════════════════

describe('rateLimitByApiKeyCore', () => {
  it('throws AuthenticationError when no api key is present', async () => {
    const ts = makeTs()

    await expect(rateLimitByApiKeyCore(ts, undefined)).rejects.toThrow(/Authentication required/)
    expect(ts.rateLimiter.checkDailyLimit).not.toHaveBeenCalled()
  })

  it('returns the remaining/limit budget when allowed', async () => {
    const ts = makeTs()
    const apiKey = apiKeyInfo()
    ts.rateLimiter.checkDailyLimit.mockResolvedValue({
      allowed: true,
      remaining: 42,
      limit: 100,
      current: 58,
    })

    const result = await rateLimitByApiKeyCore(ts, apiKey)

    expect(ts.rateLimiter.checkDailyLimit).toHaveBeenCalledWith(apiKey)
    expect(result).toEqual({ remaining: 42, limit: 100 })
  })

  it('throws RateLimitExceededError when the daily limit is hit', async () => {
    const ts = makeTs()
    ts.rateLimiter.checkDailyLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      limit: 100,
      current: 100,
    })

    await expect(rateLimitByApiKeyCore(ts, apiKeyInfo())).rejects.toMatchObject({
      name: 'RateLimitExceededError',
      planLimit: 100,
      statusCode: 429,
      code: 'DAILY_LIMIT_EXCEEDED',
    })
  })
})

describe('rateLimitByIpCore', () => {
  it('returns the remaining budget and reset time when not blocked', async () => {
    const ts = makeTs()
    const resetAtMs = Date.now() + 60_000
    ts.rateLimiter.checkIpCreationLimit.mockReturnValue({ blocked: false, remaining: 4, resetAtMs })

    const result = await rateLimitByIpCore(ts, '203.0.113.9')

    expect(ts.rateLimiter.checkIpCreationLimit).toHaveBeenCalledWith('203.0.113.9')
    expect(result).toEqual({ remaining: 4, resetAtMs })
  })

  it('throws a 429 TenantScaleError with a retryAfter hint when blocked', async () => {
    const ts = makeTs()
    const resetAtMs = Date.now() + 5_000
    ts.rateLimiter.checkIpCreationLimit.mockReturnValue({ blocked: true, remaining: 0, resetAtMs })

    await expect(rateLimitByIpCore(ts, '203.0.113.9')).rejects.toMatchObject({
      code: 'IP_RATE_LIMITED',
      statusCode: 429,
    })
  })

  it('clamps retryAfter to at least 1 second', async () => {
    const ts = makeTs()
    // Reset time already in the past — retryAfter must never be <= 0.
    ts.rateLimiter.checkIpCreationLimit.mockReturnValue({
      blocked: true,
      remaining: 0,
      resetAtMs: Date.now() - 10_000,
    })

    try {
      await rateLimitByIpCore(ts, '203.0.113.9')
      throw new Error('expected rateLimitByIpCore to throw')
    } catch (err) {
      expect((err as { retryAfter: number }).retryAfter).toBe(1)
    }
  })
})

// ══════════════════════════════════════════════════════════
// Audit Logging
// ══════════════════════════════════════════════════════════

describe('auditLogCore', () => {
  const config = { action: 'team.invited', resource: '/team/invite' }

  it('silently skips when no tenant id is resolved', () => {
    const ts = makeTs()

    auditLogCore(ts, undefined, config, {})

    expect(ts.logAuditEvent).not.toHaveBeenCalled()
  })

  it('derives the actor from the portal session and defaults type to user', () => {
    const ts = makeTs()

    auditLogCore(ts, 'tenant_acme', config, { session: portalSession(), ip: '1.2.3.4' })

    expect(ts.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant_acme',
        actor_id: 'user_42',
        actor_type: 'user',
        action: 'team.invited',
        resource: '/team/invite',
        ip: '1.2.3.4',
      }),
    )
  })

  it('derives the actor from the api key and defaults type to admin_api', () => {
    const ts = makeTs()

    auditLogCore(ts, 'tenant_acme', config, { apiKey: apiKeyInfo() })

    expect(ts.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ actor_id: 'user_owner', actor_type: 'admin_api' }),
    )
  })

  it('honours an explicit actorId and actorType override', () => {
    const ts = makeTs()

    auditLogCore(ts, 'tenant_acme', { ...config, actorType: 'system' }, { actorId: 'svc_1' })

    expect(ts.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ actor_id: 'svc_1', actor_type: 'system' }),
    )
  })

  it('swallows audit failures and logs them instead of throwing', async () => {
    const ts = makeTs()
    ts.logAuditEvent.mockRejectedValue(new Error('write failed'))

    expect(() => auditLogCore(ts, 'tenant_acme', config, {})).not.toThrow()
    // Flush the rejected promise's .catch handler.
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(ts.logger.error).toHaveBeenCalled()
  })
})
