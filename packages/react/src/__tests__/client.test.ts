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
// @tenantscale/react — TenantScaleClient behavior tests
// ──────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from 'vitest'
import { TenantScaleClient } from '../client.js'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function emptyResponse(status: number, statusText?: string): Response {
  return new Response(null, { status, statusText })
}

type FetchMock = ReturnType<typeof vi.fn>

interface MakeClientOptions {
  body?: unknown
  status?: number
  getAccessToken?: () => string | null
  baseUrl?: string
}

const DEFAULT_BODY = {
  user: { id: 'u1', email: 'a@b.c' },
  tenant: { id: 't1' },
}

/**
 * Build a client whose injected fetch returns a FRESH response per call.
 * A fresh Response each time is essential: bodies are single-read, so
 * reusing one object across fetches breaks caching/refetch tests.
 */
function makeClient(opts: MakeClientOptions = {}): {
  client: TenantScaleClient
  fetchMock: FetchMock
} {
  const {
    body = DEFAULT_BODY,
    status = 200,
    getAccessToken = () => null,
    baseUrl = 'http://localhost:3001/',
  } = opts
  const fetchMock = vi.fn().mockImplementation(async (): Promise<Response> => {
    if (status === 204) return emptyResponse(204)
    return jsonResponse(status, body)
  })
  const client = new TenantScaleClient({
    baseUrl,
    fetch: fetchMock as unknown as typeof globalThis.fetch,
    getAccessToken,
  })
  return { client, fetchMock }
}

describe('TenantScaleClient', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('normalizes a trailing slash on the base URL', async () => {
    const { client, fetchMock } = makeClient()
    await client.getMe()
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toBe('http://localhost:3001/v1/portal/me')
  })

  it('sends GET requests with the JSON content-type header', async () => {
    const { client, fetchMock } = makeClient()
    await client.getMe()
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('GET')
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' })
  })

  it('attaches a Bearer token when an access token is available', async () => {
    const { client, fetchMock } = makeClient({ getAccessToken: () => 'secret-token' })
    await client.getMe()
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
  })

  it('omits the Authorization header when no token is available', async () => {
    const { client, fetchMock } = makeClient()
    await client.getMe()
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.headers).not.toHaveProperty('Authorization')
  })

  it('includes query params for paginated endpoints', async () => {
    const { client, fetchMock } = makeClient({
      body: { data: [], meta: { page: 1, limit: 50, total: 0, total_pages: 0 } },
    })
    await client.getAuditLog(2, 25)
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toBe('http://localhost:3001/v1/portal/audit?page=2&limit=25')
  })

  it('throws the API error message on a non-OK response', async () => {
    const { client } = makeClient({ status: 400, body: { error: 'invalid tenant' } })
    await expect(client.getMe()).rejects.toThrow('invalid tenant')
  })

  it('falls back to the response status text when the error body is not JSON', async () => {
    const { client, fetchMock } = makeClient()
    fetchMock.mockResolvedValueOnce(emptyResponse(502, 'Service Unavailable'))
    await expect(client.getMe()).rejects.toThrow('Service Unavailable')
  })

  it('resolves undefined for a 204 no-content response', async () => {
    const { client, fetchMock } = makeClient()
    fetchMock.mockResolvedValueOnce(emptyResponse(204))
    await expect(client.deleteWebhook('wh_1')).resolves.toBeUndefined()
  })

  it('caches GET responses and serves them from cache', async () => {
    const { client, fetchMock } = makeClient()
    await client.getMe()
    await client.getMe()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not cache mutation requests', async () => {
    const { client, fetchMock } = makeClient({ status: 204 })
    await client.createApiKey('label')
    await client.createApiKey('label-2')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('invalidates a cached entry for the mutated resource', async () => {
    const { client, fetchMock } = makeClient()
    await client.getApiKeys()
    await client.getApiKeys()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await client.createApiKey('new-key')
    // Next GET must refetch after invalidation
    await client.getApiKeys()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('clears all cache entries with clearCache', async () => {
    const { client, fetchMock } = makeClient()
    await client.getMe()
    client.clearCache()
    await client.getMe()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('expires cached entries after 60 seconds', async () => {
    vi.useFakeTimers()
    const { client, fetchMock } = makeClient()
    await client.getMe()
    await client.getMe()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(61_000)
    await client.getMe()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('serializes the request body as JSON on writes', async () => {
    const { client, fetchMock } = makeClient({ status: 204 })
    await client.updateWebhook('wh_1', { url: 'https://example.com/hook' })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({ url: 'https://example.com/hook' })
  })
})
