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
// WebhookDispatcher — Comprehensive Unit Tests
// ──────────────────────────────────────────────────────
// NOTE: No real network calls are made. The Supabase query chain is stubbed
// and global fetch is replaced with a spy. SSRF validation is exercised with
// IP literals only (public 8.8.8.8 / private 10.0.0.1) so no DNS is required,
// and retry delays are set to 0 so backoff never slows the suite.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHash, createHmac } from 'node:crypto'
import { WebhookDispatcher } from '../webhook.js'
import type { Logger } from '../types.js'

// ── Fixtures & helpers ──

interface WebhookRow {
  id: string
  url: string
  secret: string
}

const EVENT = 'user.created'
const TENANT = 'tenant_001'
const DATA = { userId: 'u_1', plan: 'hobby' }
const PUBLIC_URL = 'http://8.8.8.8/hook'
const PRIVATE_URL = 'http://10.0.0.1/hook'
const SECRET = 'whsec_test_secret'

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

/**
 * Minimal Supabase stub: `.from('webhooks').select('*').eq().eq().contains()`
 * resolves to the supplied result; `.from('webhook_deliveries').insert(row)`
 * records rows and resolves (or rejects) per `insertImpl`.
 */
function makeSupabase(
  result: { data: unknown; error: unknown },
  insertImpl: (row: unknown) => Promise<{ error: unknown }> = async () => ({ error: null }),
) {
  const deliveries: Record<string, unknown>[] = []
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.contains = vi.fn(async () => result)
  const insert = vi.fn(async (row: Record<string, unknown>) => {
    deliveries.push(row)
    return insertImpl(row)
  })
  const from = vi.fn((table: string) => {
    if (table === 'webhook_deliveries') return { insert }
    return chain
  })
  return { supabase: { from } as never, from, chain, insert, deliveries }
}

function fetchResponse(status: number, bodyText = '{"ok":true}') {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => bodyText,
  }
}

function setup(
  result: { data: unknown; error: unknown },
  opts: {
    options?: Record<string, unknown>
    fetchImpl?: (...args: unknown[]) => Promise<unknown>
    insertImpl?: (row: unknown) => Promise<{ error: unknown }>
  } = {},
) {
  const logger = makeLogger()
  const { supabase, from, chain, insert, deliveries } = makeSupabase(result, opts.insertImpl)
  const fetchMock = vi.fn(opts.fetchImpl ?? (async () => fetchResponse(200)))
  vi.stubGlobal('fetch', fetchMock)
  const dispatcher = new WebhookDispatcher(supabase as never, {
    logger: logger as unknown as Logger,
    // Three zero delays so the default maxRetries (3) never actually waits.
    retryDelays: [0, 0, 0],
    ...opts.options,
  })
  return { dispatcher, logger, fetchMock, from, chain, insert, deliveries }
}

// ── Tests ──

describe('WebhookDispatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // ══════════════════════════════════════════════════════
  // Subscription lookup
  // ══════════════════════════════════════════════════════

  it('returns an empty array when no webhooks are subscribed', async () => {
    const { dispatcher, fetchMock } = setup({ data: [], error: null })

    await expect(dispatcher.deliver(EVENT, TENANT, DATA)).resolves.toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns an empty array and logs when the subscription query errors', async () => {
    const { dispatcher, logger, fetchMock } = setup({ data: null, error: { message: 'boom' } })

    await expect(dispatcher.deliver(EVENT, TENANT, DATA)).resolves.toEqual([])
    expect(logger.error).toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns an empty array when the query yields null data without an error', async () => {
    const { dispatcher } = setup({ data: null, error: null })
    await expect(dispatcher.deliver(EVENT, TENANT, DATA)).resolves.toEqual([])
  })

  it('scopes the lookup to the tenant and filters to active webhooks subscribed to the event', async () => {
    const hook: WebhookRow = { id: 'wh_1', url: PUBLIC_URL, secret: SECRET }
    const { dispatcher, chain, from } = setup({ data: [hook], error: null })

    await dispatcher.deliver(EVENT, TENANT, DATA)

    expect(from).toHaveBeenCalledWith('webhooks')
    expect(chain.eq).toHaveBeenCalledWith('tenant_id', TENANT)
    expect(chain.eq).toHaveBeenCalledWith('is_active', true)
    expect(chain.contains).toHaveBeenCalledWith('events', [EVENT])
  })

  // ══════════════════════════════════════════════════════
  // Successful delivery
  // ══════════════════════════════════════════════════════

  it('DELIVERS a signed POST to a subscribed webhook and reports delivered', async () => {
    const hook: WebhookRow = { id: 'wh_1', url: PUBLIC_URL, secret: SECRET }
    const { dispatcher, fetchMock } = setup({ data: [hook], error: null })

    const results = await dispatcher.deliver(EVENT, TENANT, DATA)

    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      webhook_id: 'wh_1',
      status: 'delivered',
      response_status: 200,
      duration_ms: expect.any(Number),
      error_message: null,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(PUBLIC_URL)
    expect(init.method).toBe('POST')
  })

  it('sends the webhook payload shape (event, tenant_id, created_at, data)', async () => {
    const hook: WebhookRow = { id: 'wh_1', url: PUBLIC_URL, secret: SECRET }
    const { dispatcher, fetchMock } = setup({ data: [hook], error: null })

    await dispatcher.deliver(EVENT, TENANT, DATA)

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.event).toBe(EVENT)
    expect(body.tenant_id).toBe(TENANT)
    expect(body.data).toEqual(DATA)
    expect(new Date(body.created_at).toISOString()).toBe(body.created_at)
  })

  it('signs the payload with an HMAC-SHA256 of the body using the webhook secret', async () => {
    const hook: WebhookRow = { id: 'wh_1', url: PUBLIC_URL, secret: SECRET }
    const { dispatcher, fetchMock } = setup({ data: [hook], error: null })

    await dispatcher.deliver(EVENT, TENANT, DATA)

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    const expected = createHmac('sha256', SECRET)
      .update(init.body as string)
      .digest('hex')
    expect(headers['X-TenantScale-Signature']).toBe(expected)
  })

  it('derives the delivery id from the first 12 hex chars of the body hash', async () => {
    const hook: WebhookRow = { id: 'wh_1', url: PUBLIC_URL, secret: SECRET }
    const { dispatcher, fetchMock } = setup({ data: [hook], error: null })

    await dispatcher.deliver(EVENT, TENANT, DATA)

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    const expectedId = createHash('sha256')
      .update(init.body as string)
      .digest('hex')
      .slice(0, 12)
    expect(headers['X-TenantScale-Delivery']).toBe(expectedId)
    expect(headers['X-TenantScale-Delivery']).toHaveLength(12)
  })

  it('sets the event, content-type and default user-agent headers', async () => {
    const hook: WebhookRow = { id: 'wh_1', url: PUBLIC_URL, secret: SECRET }
    const { dispatcher, fetchMock } = setup({ data: [hook], error: null })

    await dispatcher.deliver(EVENT, TENANT, DATA)

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers['X-TenantScale-Event']).toBe(EVENT)
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers['User-Agent']).toBe('TenantScale-Webhook/1.0')
  })

  it('honours a custom user-agent', async () => {
    const hook: WebhookRow = { id: 'wh_1', url: PUBLIC_URL, secret: SECRET }
    const { dispatcher, fetchMock } = setup(
      { data: [hook], error: null },
      { options: { userAgent: 'Acme-Hooks/9' } },
    )

    await dispatcher.deliver(EVENT, TENANT, DATA)

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>)['User-Agent']).toBe('Acme-Hooks/9')
  })

  it('delivers to every subscribed webhook in parallel', async () => {
    const hooks: WebhookRow[] = [
      { id: 'wh_1', url: PUBLIC_URL, secret: 'sec_1' },
      { id: 'wh_2', url: 'http://1.1.1.1/hook', secret: 'sec_2' },
    ]
    const { dispatcher, fetchMock } = setup({ data: hooks, error: null })

    const results = await dispatcher.deliver(EVENT, TENANT, DATA)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(results.map((r) => r.webhook_id)).toEqual(['wh_1', 'wh_2'])
    expect(results.every((r) => r.status === 'delivered')).toBe(true)
  })

  // ══════════════════════════════════════════════════════
  // SSRF protection
  // ══════════════════════════════════════════════════════

  it('does not fetch a webhook whose URL fails SSRF validation', async () => {
    const hook: WebhookRow = { id: 'wh_1', url: PRIVATE_URL, secret: SECRET }
    const { dispatcher, fetchMock } = setup({ data: [hook], error: null })

    const results = await dispatcher.deliver(EVENT, TENANT, DATA)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(results[0].status).toBe('failed')
    expect(results[0].error_message).toContain('Blocked private IP')
  })

  // ══════════════════════════════════════════════════════
  // Unhappy path — HTTP + retry
  // ══════════════════════════════════════════════════════

  it('marks a delivery failed on a non-2xx response without retrying', async () => {
    const hook: WebhookRow = { id: 'wh_1', url: PUBLIC_URL, secret: SECRET }
    const { dispatcher, fetchMock } = setup(
      { data: [hook], error: null },
      { fetchImpl: async () => fetchResponse(500, 'server error') },
    )

    const results = await dispatcher.deliver(EVENT, TENANT, DATA)

    expect(results[0]).toEqual({
      webhook_id: 'wh_1',
      status: 'failed',
      response_status: 500,
      duration_ms: expect.any(Number),
      error_message: 'HTTP 500',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries a thrown network error up to maxRetries and reports failure', async () => {
    const hook: WebhookRow = { id: 'wh_1', url: PUBLIC_URL, secret: SECRET }
    const fetchMock = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    })
    const { dispatcher } = setup({ data: [hook], error: null }, { fetchImpl: fetchMock })

    const results = await dispatcher.deliver(EVENT, TENANT, DATA)

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(results[0].status).toBe('failed')
    expect(results[0].response_status).toBeNull()
    expect(results[0].error_message).toBe('ECONNREFUSED (after 3 attempts)')
  })

  it('stops retrying once a later attempt succeeds', async () => {
    const hook: WebhookRow = { id: 'wh_1', url: PUBLIC_URL, secret: SECRET }
    let attempts = 0
    const fetchMock = vi.fn(async () => {
      attempts += 1
      if (attempts < 3) throw new Error('transient')
      return fetchResponse(200)
    })
    const { dispatcher } = setup({ data: [hook], error: null }, { fetchImpl: fetchMock })

    const results = await dispatcher.deliver(EVENT, TENANT, DATA)

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(results[0].status).toBe('delivered')
    expect(results[0].response_status).toBe(200)
  })

  it('honours a custom maxRetries', async () => {
    const hook: WebhookRow = { id: 'wh_1', url: PUBLIC_URL, secret: SECRET }
    const fetchMock = vi.fn(async () => {
      throw new Error('nope')
    })
    const { dispatcher } = setup(
      { data: [hook], error: null },
      { fetchImpl: fetchMock, options: { maxRetries: 1 } },
    )

    const results = await dispatcher.deliver(EVENT, TENANT, DATA)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(results[0].error_message).toBe('nope (after 1 attempts)')
  })

  // ══════════════════════════════════════════════════════
  // Delivery logging
  // ══════════════════════════════════════════════════════

  it('persists a delivery row with status, response status and duration', async () => {
    const hook: WebhookRow = { id: 'wh_1', url: PUBLIC_URL, secret: SECRET }
    const { dispatcher, deliveries } = setup({ data: [hook], error: null })

    await dispatcher.deliver(EVENT, TENANT, DATA)

    expect(deliveries).toHaveLength(1)
    expect(deliveries[0]).toEqual({
      webhook_id: 'wh_1',
      event_type: EVENT,
      url: PUBLIC_URL,
      request_body: null,
      response_status: 200,
      response_body: '{"ok":true}',
      status: 'delivered',
      error_message: null,
      duration_ms: expect.any(Number),
    })
  })

  it('truncates the stored response body to 1000 characters', async () => {
    const hook: WebhookRow = { id: 'wh_1', url: PUBLIC_URL, secret: SECRET }
    const { dispatcher, deliveries } = setup(
      { data: [hook], error: null },
      { fetchImpl: async () => fetchResponse(200, 'x'.repeat(1500)) },
    )

    await dispatcher.deliver(EVENT, TENANT, DATA)

    expect((deliveries[0].response_body as string).length).toBe(1000)
  })

  it('records a failed delivery row with the error message', async () => {
    const hook: WebhookRow = { id: 'wh_1', url: PUBLIC_URL, secret: SECRET }
    const fetchMock = vi.fn(async () => {
      throw new Error('boom')
    })
    const { dispatcher, logger, deliveries } = setup(
      { data: [hook], error: null },
      { fetchImpl: fetchMock },
    )

    await dispatcher.deliver(EVENT, TENANT, DATA)

    expect(deliveries[0].status).toBe('failed')
    expect(deliveries[0].response_status).toBeNull()
    expect(deliveries[0].response_body).toBeNull()
    expect(deliveries[0].error_message).toBe('boom (after 3 attempts)')
    expect(logger.error).toHaveBeenCalled()
  })

  it('does not throw when recording a delivery row fails', async () => {
    const hook: WebhookRow = { id: 'wh_1', url: PUBLIC_URL, secret: SECRET }
    const { dispatcher, logger } = setup(
      { data: [hook], error: null },
      {
        insertImpl: async () => {
          throw new Error('insert failed')
        },
      },
    )

    // A throwing insert is swallowed by logDelivery and warned about; the
    // delivery result itself is still returned to the caller.
    await expect(dispatcher.deliver(EVENT, TENANT, DATA)).resolves.toHaveLength(1)
    expect(logger.warn).toHaveBeenCalled()
  })

  // ══════════════════════════════════════════════════════
  // dispatch() — fire-and-forget
  // ══════════════════════════════════════════════════════

  it('dispatch() delegates to deliver() and returns undefined without awaiting', () => {
    const { dispatcher } = setup({ data: [], error: null })
    const spy = vi.spyOn(dispatcher, 'deliver').mockResolvedValue([])

    const ret = dispatcher.dispatch(EVENT, TENANT, DATA)

    expect(ret).toBeUndefined()
    expect(spy).toHaveBeenCalledWith(EVENT, TENANT, DATA)
  })

  it('dispatch() logs an error when delivery rejects', async () => {
    const { dispatcher, logger } = setup({ data: [], error: null })
    vi.spyOn(dispatcher, 'deliver').mockRejectedValue(new Error('async boom'))

    dispatcher.dispatch(EVENT, TENANT, DATA)

    await vi.waitFor(() => expect(logger.error).toHaveBeenCalled())
  })

  // ══════════════════════════════════════════════════════
  // Defaults
  // ══════════════════════════════════════════════════════

  it('defaults to 3 retries and the default user-agent when options are omitted', async () => {
    const hook: WebhookRow = { id: 'wh_1', url: PUBLIC_URL, secret: SECRET }
    const logger = makeLogger()
    const { supabase } = makeSupabase({ data: [hook], error: null })
    const fetchMock = vi.fn(async () => {
      throw new Error('down')
    })
    vi.stubGlobal('fetch', fetchMock)

    const dispatcher = new WebhookDispatcher(supabase as never, {
      logger: logger as unknown as Logger,
      retryDelays: [0, 0, 0],
    })

    const results = await dispatcher.deliver(EVENT, TENANT, DATA)

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(results[0].error_message).toBe('down (after 3 attempts)')
  })
})
