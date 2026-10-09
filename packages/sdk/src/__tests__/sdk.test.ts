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
// TenantScale — Main SDK class tests
// ──────────────────────────────────────────────────────
// Covers the framework-agnostic entry point: constructor validation and
// module wiring, destroy() teardown, and delegation to the underlying
// modules (auth, session, audit, api-key, pagination).
//
// NOTE: No network is used. Supabase is replaced with a tiny query-builder
// stub that resolves canned rows, so the class is exercised end-to-end
// without real credentials.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import { TenantScale } from '../sdk.js'
import { PlanStore } from '../plan.js'
import { RateLimiter } from '../rate-limit.js'
import { WebhookDispatcher } from '../webhook.js'
import { StripeClient } from '../stripe.js'
import { AuthorizationError, AuthenticationError } from '../types.js'
import type { ApiKeyInfo, PortalSessionInfo } from '../types.js'

// ── Fixtures & helpers ──

interface SupabaseConfig {
  apiKey?: { data: unknown; error: unknown }
  platformAdmin?: { data: unknown }
  membership?: { data: unknown }
  user?: { id: string; email?: string } | null
  authError?: unknown
}

const KEY_RECORD = {
  id: 'key_1',
  tenant_id: 'tenant_1',
  scopes: ['tenants:read'],
  created_by: null,
  is_active: true,
  expires_at: null,
  tenant: { id: 'tenant_1', is_active: true },
}

const MEMBERSHIP = {
  id: 'mem_1',
  role: 'admin',
  tenant: { id: 'tenant_1', name: 'Acme', slug: 'acme' },
}

/**
 * Minimal Supabase stub. `from(table)` returns a chainable query builder
 * whose terminal methods (`single`, `maybeSingle`) resolve canned rows;
 * `auth.getUser` resolves the configured user.
 */
function makeSupabase(config: SupabaseConfig = {}) {
  function builder(table: string) {
    const chain: Record<string, unknown> = {}
    chain.select = vi.fn(() => chain)
    chain.eq = vi.fn(() => chain)
    // The fire-and-forget update path is `.update(...).eq(...).then(...)`;
    // returning a promise from that terminal `.eq` makes it thenable.
    chain.update = vi.fn(() => ({ eq: vi.fn(async () => ({ data: null, error: null })) }))
    chain.insert = vi.fn(async () => ({ error: null }))
    chain.single = vi.fn(async () => config.apiKey ?? { data: null, error: null })
    chain.maybeSingle = vi.fn(async () => {
      if (table === 'platform_admins') return config.platformAdmin ?? { data: null }
      if (table === 'tenant_users') return config.membership ?? { data: null }
      return { data: null }
    })
    return chain
  }
  const from = vi.fn(builder)
  const getUser = vi.fn(async () => ({
    data: { user: config.user ?? null },
    error: config.authError ?? null,
  }))
  return { supabase: { from, auth: { getUser } } as never, from, getUser }
}

/** Construct a TenantScale instance over the stub, tracking it for teardown. */
const instances: TenantScale[] = []
function makeClient(options: Record<string, unknown> = {}) {
  const stub = makeSupabase((options.stubConfig as SupabaseConfig) ?? {})
  const client = new TenantScale({
    supabase: stub.supabase,
    ...options,
  } as never)
  instances.push(client)
  return { client, ...stub }
}

// ── Tests ──

describe('TenantScale', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    while (instances.length) instances.pop()?.destroy()
  })

  // ══════════════════════════════════════════════════════
  // Constructor — input validation
  // ══════════════════════════════════════════════════════

  describe('constructor validation', () => {
    it('throws when neither a Supabase client nor url + key is provided', () => {
      expect(() => new TenantScale({} as never)).toThrow(/requires either a Supabase client/)
    })

    it('throws when only supabaseUrl is provided', () => {
      expect(() => new TenantScale({ supabaseUrl: 'https://x.supabase.co' } as never)).toThrow()
    })

    it('throws when only supabaseKey is provided', () => {
      expect(() => new TenantScale({ supabaseKey: 'service-role-key' } as never)).toThrow()
    })
  })

  // ══════════════════════════════════════════════════════
  // Constructor — initialization
  // ══════════════════════════════════════════════════════

  describe('constructor', () => {
    it('uses a pre-configured Supabase client as-is', () => {
      const provided = { from: vi.fn(), tag: 'provided' }
      const client = new TenantScale({ supabase: provided as never })
      instances.push(client)
      expect(client.supabase).toBe(provided)
    })

    it('creates a Supabase client from supabaseUrl + supabaseKey', () => {
      const client = new TenantScale({
        supabaseUrl: 'https://example.supabase.co',
        supabaseKey: 'service-role-key',
      })
      instances.push(client)
      expect(typeof client.supabase.from).toBe('function')
    })

    it('wires the plan store, rate limiter and webhook dispatcher', () => {
      const { client } = makeClient()
      expect(client.plans).toBeInstanceOf(PlanStore)
      expect(client.rateLimiter).toBeInstanceOf(RateLimiter)
      expect(client.webhooks).toBeInstanceOf(WebhookDispatcher)
    })

    it('leaves stripe null when no secret key is supplied', () => {
      const { client } = makeClient()
      expect(client.stripe).toBeNull()
    })

    it('constructs a StripeClient when a secret key is supplied', () => {
      const { client } = makeClient({ stripeSecretKey: 'sk_test_123' })
      expect(client.stripe).toBeInstanceOf(StripeClient)
    })

    it('defaults the logger to console', () => {
      const { client } = makeClient()
      expect(client.logger).toBe(console)
    })

    it('honours a custom logger', () => {
      const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
      const { client } = makeClient({ logger })
      expect(client.logger).toBe(logger)
    })

    it('exposes the deployment mode label', () => {
      const { client } = makeClient({ deploymentMode: 'self_hosted' })
      expect(client.deploymentMode).toBe('self_hosted')
    })

    it('destroy() stops the plan store and rate limiter timers', () => {
      const { client } = makeClient()
      const planSpy = vi.spyOn(client.plans, 'destroy')
      const rlSpy = vi.spyOn(client.rateLimiter, 'destroy')
      client.destroy()
      expect(planSpy).toHaveBeenCalledOnce()
      expect(rlSpy).toHaveBeenCalledOnce()
    })
  })

  // ══════════════════════════════════════════════════════
  // Delegated auth
  // ══════════════════════════════════════════════════════

  describe('validateApiKey', () => {
    it('resolves API key info through Supabase', async () => {
      const { client } = makeClient({ stubConfig: { apiKey: { data: KEY_RECORD, error: null } } })

      const info = await client.validateApiKey('tk_raw_token')

      expect(info).toEqual<ApiKeyInfo>({
        raw: 'tk_raw_token',
        tenant_id: 'tenant_1',
        scopes: ['tenants:read'],
        created_by: null,
        key_record_id: 'key_1',
      })
    })

    it('rejects an empty token without querying Supabase', async () => {
      const { client, from } = makeClient()
      await expect(client.validateApiKey('')).rejects.toBeInstanceOf(AuthenticationError)
      expect(from).not.toHaveBeenCalled()
    })
  })

  describe('requireScope', () => {
    const apiKey: ApiKeyInfo = {
      raw: 'tk_raw_token',
      tenant_id: 'tenant_1',
      scopes: ['tenants:read'],
      created_by: null,
      key_record_id: 'key_1',
    }

    it('passes when the key holds a required scope', () => {
      const { client } = makeClient()
      expect(() => client.requireScope(apiKey, 'tenants:read', 'tenants:write')).not.toThrow()
    })

    it('throws AuthorizationError when the scope is missing', () => {
      const { client } = makeClient()
      expect(() => client.requireScope(apiKey, 'tenants:write')).toThrow(AuthorizationError)
    })
  })

  describe('validateSession', () => {
    it('resolves the tenant membership for a session JWT', async () => {
      const { client, getUser } = makeClient({
        stubConfig: { user: { id: 'user_1', email: 'a@b.com' }, membership: { data: MEMBERSHIP } },
      })

      const session = await client.validateSession('jwt-token')

      expect(getUser).toHaveBeenCalledWith('jwt-token')
      expect(session).toEqual<PortalSessionInfo>({
        user_id: 'user_1',
        email: 'a@b.com',
        tenant_id: 'tenant_1',
        tenant_slug: 'acme',
        tenant_name: 'Acme',
        role: 'admin',
        membership_id: 'mem_1',
        is_super_admin: false,
      })
    })
  })

  describe('requirePortalRole / requireSuperAdmin', () => {
    const session: PortalSessionInfo = {
      user_id: 'user_1',
      email: 'a@b.com',
      tenant_id: 'tenant_1',
      tenant_slug: 'acme',
      tenant_name: 'Acme',
      role: 'admin',
      membership_id: 'mem_1',
      is_super_admin: false,
    }

    it('requirePortalRole passes for an allowed role and throws otherwise', () => {
      const { client } = makeClient()
      expect(() => client.requirePortalRole(session, 'admin')).not.toThrow()
      expect(() => client.requirePortalRole(session, 'owner')).toThrow(AuthorizationError)
    })

    it('requireSuperAdmin throws for a non-super-admin', () => {
      const { client } = makeClient()
      expect(() => client.requireSuperAdmin(session)).toThrow(AuthorizationError)
    })

    it('requireSuperAdmin passes for a super admin', () => {
      const { client } = makeClient()
      expect(() => client.requireSuperAdmin({ ...session, is_super_admin: true })).not.toThrow()
    })
  })

  // ══════════════════════════════════════════════════════
  // Delegated audit
  // ══════════════════════════════════════════════════════

  describe('logAuditEvent', () => {
    it('inserts the event into the audit_events table', async () => {
      const { client, from } = makeClient()

      await client.logAuditEvent({
        tenant_id: 'tenant_1',
        actor_type: 'system',
        action: 'tenant.created',
        resource: 'tenant:tenant_1',
      })

      expect(from).toHaveBeenCalledWith('audit_events')
    })
  })

  describe('getClientIp', () => {
    it('reads the first IP from x-forwarded-for on a Headers object', () => {
      const { client } = makeClient()
      const headers = new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' })
      expect(client.getClientIp(headers)).toBe('203.0.113.7')
    })

    it('falls back to x-real-ip then unknown for plain records', () => {
      const { client } = makeClient()
      expect(client.getClientIp({ 'x-real-ip': '198.51.100.4' })).toBe('198.51.100.4')
      expect(client.getClientIp({})).toBe('unknown')
    })
  })

  // ══════════════════════════════════════════════════════
  // Delegated API-key helpers
  // ══════════════════════════════════════════════════════

  describe('API key helpers', () => {
    it('generateApiKey returns a tk_ key with a matching SHA-256 hash', () => {
      const { client } = makeClient()
      const generated = client.generateApiKey()
      expect(generated.rawKey.startsWith('tk_')).toBe(true)
      expect(generated.keyHash).toBe(createHash('sha256').update(generated.rawKey).digest('hex'))
      expect(generated.keyPrefix).toBe(generated.rawKey.slice(0, 8))
    })

    it('hashApiKey is deterministic', () => {
      const { client } = makeClient()
      expect(client.hashApiKey('tk_abc')).toBe(client.hashApiKey('tk_abc'))
      expect(client.hashApiKey('tk_abc')).toBe(createHash('sha256').update('tk_abc').digest('hex'))
    })

    it('isValidApiKeyFormat accepts generated keys and rejects malformed input', () => {
      const { client } = makeClient()
      expect(client.isValidApiKeyFormat(client.generateApiKey().rawKey)).toBe(true)
      expect(client.isValidApiKeyFormat('nope')).toBe(false)
      expect(client.isValidApiKeyFormat('tk_short')).toBe(false)
    })
  })

  // ══════════════════════════════════════════════════════
  // Delegated pagination helpers
  // ══════════════════════════════════════════════════════

  describe('pagination helpers', () => {
    it('parses page and limit from a query record', () => {
      const { client } = makeClient()
      expect(client.parsePaginationParams({ page: '3', limit: '20' })).toEqual({
        page: 3,
        limit: 20,
        offset: 40,
      })
    })

    it('applies the default limit and clamps to the maximum', () => {
      const { client } = makeClient()
      expect(client.parsePaginationParams({}, 25).limit).toBe(25)
      expect(client.parsePaginationParams({ limit: '500' }).limit).toBe(100)
    })

    it('builds a pagination response with computed total_pages', () => {
      const { client } = makeClient()
      expect(client.paginationResponse(2, 25, 60)).toEqual({
        page: 2,
        limit: 25,
        total: 60,
        total_pages: 3,
      })
      expect(client.paginationResponse(1, 25, 0).total_pages).toBe(0)
    })
  })
})
