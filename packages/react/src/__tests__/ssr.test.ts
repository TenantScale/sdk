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
// @tenantscale/react — SSR helper behavior tests
// ──────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from 'vitest'
import { getTenantSsr, getTenantSsrFromHeaders } from '../ssr.js'

const ME_BODY = {
  user: { id: 'u1', email: 'admin@acme.test' },
  tenant: { id: 't1', name: 'Acme', slug: 'acme', role: 'owner', is_super_admin: false },
  plan: { id: 'p1', name: 'Starter', price_monthly: 0, features: {}, limits: {} },
  deployment: { mode: 'cloud' },
}

function response(status: number, body?: unknown): Response {
  return new Response(body ? JSON.stringify(body) : null, { status })
}

describe('getTenantSsr', () => {
  it('returns the tenant context on a successful response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200, ME_BODY))
    const ctx = await getTenantSsr(
      'http://localhost:3001',
      'session=abc',
      fetchMock as unknown as typeof globalThis.fetch,
    )
    expect(ctx).not.toBeNull()
    expect(ctx!.tenant.name).toBe('Acme')
    expect(ctx!.user.email).toBe('admin@acme.test')
  })

  it('forwards the Cookie header to the TenantScale API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200, ME_BODY))
    await getTenantSsr(
      'http://localhost:3001',
      'session=abc',
      fetchMock as unknown as typeof globalThis.fetch,
    )
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(new Headers(init.headers).get('Cookie')).toBe('session=abc')
  })

  it('trims a trailing slash from the base URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200, ME_BODY))
    await getTenantSsr(
      'http://localhost:3001/',
      'session=abc',
      fetchMock as unknown as typeof globalThis.fetch,
    )
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toBe('http://localhost:3001/v1/portal/me')
  })

  it('returns null on a 401 unauthenticated response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(401))
    const ctx = await getTenantSsr(
      'http://localhost:3001',
      '',
      fetchMock as unknown as typeof globalThis.fetch,
    )
    expect(ctx).toBeNull()
  })

  it('throws on a non-OK, non-401 response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(503))
    await expect(
      getTenantSsr('http://localhost:3001', '', fetchMock as unknown as typeof globalThis.fetch),
    ).rejects.toThrow('HTTP 503')
  })

  it('throws when the fetch promise rejects (network error)', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    await expect(
      getTenantSsr('http://localhost:3001', '', fetchMock as unknown as typeof globalThis.fetch),
    ).rejects.toThrow('ECONNREFUSED')
  })
})

describe('getTenantSsrFromHeaders', () => {
  // getTenantSsrFromHeaders has no custom-fetch parameter (it always calls
  // global fetch), so stub the global fetch implementation to intercept it.
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('extracts the cookie from a NameValueHeaders object', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200, ME_BODY))
    vi.stubGlobal('fetch', fetchMock)

    const headers = { get: (name: string) => (name === 'cookie' ? 'session=xyz' : null) }
    const ctx = await getTenantSsrFromHeaders(
      'http://localhost:3001',
      headers as unknown as Headers,
    )
    expect(ctx!.tenant.slug).toBe('acme')

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(new Headers(init.headers).get('Cookie')).toBe('session=xyz')
  })

  it('passes an empty cookie string when none is present', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200, ME_BODY))
    vi.stubGlobal('fetch', fetchMock)

    const headers = { get: () => null }
    await getTenantSsrFromHeaders('http://localhost:3001', headers as unknown as Headers)

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(new Headers(init.headers).get('Cookie')).toBe('')
  })
})
