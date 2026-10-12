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
// Webhook Dispatcher — fire-and-forget event delivery
// Framework-agnostic: pure logic, returns results
// ──────────────────────────────────────────────────────

import { createHash, createHmac } from 'node:crypto'
import { request as httpRequest, Agent as HttpAgent, type RequestOptions as HttpRequestOptions, type ClientRequest, type IncomingMessage } from 'node:http'
import { request as httpsRequest, Agent as HttpsAgent } from 'node:https'
import type { LookupFunction } from 'node:net'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WebhookPayload, WebhookDeliveryResult, Logger } from './types.js'
import { validateWebhookUrlPinned } from './ssrf.js'

const DEFAULT_MAX_RETRIES = 3
const DEFAULT_RETRY_DELAYS = [1_000, 4_000, 15_000] // 1s, 4s, 15s
const DEFAULT_FETCH_TIMEOUT_MS = 10_000
const DEFAULT_USER_AGENT = 'TenantScale-Webhook/1.0'

/**
 * Fire-and-forget webhook event delivery with retry logic.
 */
export class WebhookDispatcher {
  private logger: Logger
  private maxRetries: number
  private retryDelays: number[]
  private fetchTimeoutMs: number
  private userAgent: string

  constructor(
    private supabase: SupabaseClient,
    options?: {
      logger?: Logger
      maxRetries?: number
      retryDelays?: number[]
      fetchTimeoutMs?: number
      userAgent?: string
      /** If true, log webhook request/response bodies (only enable for debugging) */
      logBodies?: boolean
    },
  ) {
    this.logger = options?.logger ?? console
    this.maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES
    this.retryDelays = options?.retryDelays ?? [...DEFAULT_RETRY_DELAYS]
    this.fetchTimeoutMs = options?.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS
    this.userAgent = options?.userAgent ?? DEFAULT_USER_AGENT
  }

  /**
   * Dispatch an event to all active webhooks subscribed to this event type.
   * Fire-and-forget — doesn't block the caller.
   */
  dispatch(event: string, tenantId: string, data: Record<string, unknown>): void {
    // Don't await — intentionally non-blocking
    void this.deliver(event, tenantId, data).catch((err) => {
      this.logger.error({ err }, `[Webhook] Error dispatching ${event}`)
    })
  }

  /**
   * Dispatch an event and wait for all deliveries to complete.
   * Use this in background jobs or when you need delivery guarantees.
   */
  async deliver(
    event: string,
    tenantId: string,
    data: Record<string, unknown>,
  ): Promise<WebhookDeliveryResult[]> {
    try {
      // Find active webhooks subscribed to this event
      const { data: webhooks, error } = await this.supabase
        .from('webhooks')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .contains('events', [event])

      if (error) {
        this.logger.error({ error: error.message }, '[Webhook] Query error')
        return []
      }

      if (!webhooks || webhooks.length === 0) return []

      const payload: WebhookPayload = {
        event,
        tenant_id: tenantId,
        created_at: new Date().toISOString(),
        data,
      }

      const body = JSON.stringify(payload)

      // Deliver to each webhook in parallel
      const results = await Promise.allSettled(
        webhooks.map((hook) => this.send(hook, body, event, 1)),
      )

      return results
        .filter((r): r is PromiseFulfilledResult<WebhookDeliveryResult> => r.status === 'fulfilled')
        .map((r) => r.value)
    } catch (err) {
      this.logger.error({ err }, '[Webhook] Dispatch error')
      return []
    }
  }

  private async send(
    hook: { id: string; url: string; secret: string },
    body: string,
    event: string,
    attempt: number,
  ): Promise<WebhookDeliveryResult> {
    const start = Date.now()

    // Sign the payload with HMAC-SHA256
    const signature = createHmac('sha256', hook.secret).update(body).digest('hex')

    const deliveryId = createHash('sha256').update(body).digest('hex').slice(0, 12)

    try {
      // SSRF protection: validate the URL, then deliver pinned to a validated
      // IP. We connect to the resolved public IP (never re-resolve the
      // hostname) which prevents DNS-rebinding attacks.
      const { url, ip } = await validateWebhookUrlPinned(hook.url)

      const res = await this.postPinned(
        url,
        ip,
        {
          'Content-Type': 'application/json',
          'User-Agent': this.userAgent,
          'X-TenantScale-Event': event,
          'X-TenantScale-Signature': signature,
          'X-TenantScale-Delivery': deliveryId,
        },
        body,
      )

      const duration = Date.now() - start
      const ok = res.status >= 200 && res.status < 300

      // Log delivery
      await this.logDelivery(
        hook.id,
        event,
        hook.url,
        null,
        res.status,
        res.body,
        ok ? 'delivered' : 'failed',
        ok ? null : `HTTP ${res.status}`,
        duration,
      )

      return {
        webhook_id: hook.id,
        status: ok ? 'delivered' : 'failed',
        response_status: res.status,
        duration_ms: duration,
        error_message: ok ? null : `HTTP ${res.status}`,
      }
    } catch (err) {
      const duration = Date.now() - start
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'

      // Retry with exponential backoff
      if (attempt < this.maxRetries) {
        const delay = this.retryDelays[attempt - 1] ?? 5_000
        this.logger.warn(
          { attempt, maxRetries: this.maxRetries, url: hook.url, error: errorMsg, delay },
          `[Webhook] Delivery failed, retrying in ${delay}ms`,
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
        return this.send(hook, body, event, attempt + 1)
      }

      // Log delivery failure
      await this.logDelivery(
        hook.id,
        event,
        hook.url,
        null,
        null,
        null,
        'failed',
        `${errorMsg} (after ${this.maxRetries} attempts)`,
        duration,
      )

      this.logger.error(
        { url: hook.url, error: errorMsg, maxRetries: this.maxRetries },
        `[Webhook] Delivery failed after ${this.maxRetries} attempts`,
      )

      return {
        webhook_id: hook.id,
        status: 'failed',
        response_status: null,
        duration_ms: duration,
        error_message: `${errorMsg} (after ${this.maxRetries} attempts)`,
      }
    }
  }

  private async postPinned(
    url: URL,
    ip: string,
    headers: Record<string, string>,
    body: string,
  ): Promise<{ status: number; body: string }> {
    return new Promise<{ status: number; body: string }>((resolve, reject) => {
      const isHttps = url.protocol === 'https:'
      // Connect to the pinned validated IP, keep the original host for Host/SNI
      // and TLS verification. Redirects are NOT followed (a 3xx is returned as
      // a normal response) — following them could repoint to an internal host.
      const connectHost = ip.includes(':') ? `[${ip}]` : ip
      const family = ip.includes(':') ? 6 : 4
      const lookup: LookupFunction = (_host, _opts, cb) => cb(null, ip, family)
      const agent = isHttps ? new HttpsAgent({ lookup }) : new HttpAgent({ lookup })

      const options: HttpRequestOptions & { agent: HttpAgent | HttpsAgent; servername?: string } = {
        protocol: url.protocol,
        hostname: connectHost,
        port: url.port ? Number(url.port) : isHttps ? 443 : 80,
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        headers: { Host: url.host, ...headers },
        agent,
        servername: isHttps ? url.hostname : undefined,
      }

      const requestFn: (o: HttpRequestOptions, h?: (res: IncomingMessage) => void) => ClientRequest =
        isHttps
          ? (httpsRequest as unknown as (o: HttpRequestOptions, h?: (res: IncomingMessage) => void) => ClientRequest)
          : httpRequest

      const req = requestFn(options, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }),
        )
        res.on('error', (err) => reject(err))
      })

      const timer = setTimeout(() => {
        req.destroy(new Error(`Webhook request timed out after ${this.fetchTimeoutMs}ms`))
      }, this.fetchTimeoutMs)

      req.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
      req.on('close', () => clearTimeout(timer))
      req.write(body)
      req.end()
    })
  }

  private async logDelivery(
    webhookId: string,
    eventType: string,
    url: string,
    requestBody: string | null,
    responseStatus: number | null,
    responseBody: string | null,
    status: string,
    errorMessage: string | null,
    durationMs: number,
  ): Promise<void> {
    try {
      await this.supabase.from('webhook_deliveries').insert({
        webhook_id: webhookId,
        event_type: eventType,
        url,
        request_body: requestBody ? requestBody.slice(0, 1000) : null,
        response_status: responseStatus,
        response_body: responseBody ? responseBody.slice(0, 1000) : null,
        status,
        error_message: errorMessage,
        duration_ms: durationMs,
      })
    } catch (err) {
      this.logger.warn({ err }, '[Webhook] Failed to log delivery')
    }
  }
}
