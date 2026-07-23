// ──────────────────────────────────────────────────────
// Webhook Dispatcher — fire-and-forget event delivery
// Framework-agnostic: pure logic, returns results
// ──────────────────────────────────────────────────────

import { createHash, createHmac } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WebhookPayload, WebhookDeliveryResult, Logger } from './types.js'
import { validateWebhookUrl } from './ssrf.js'

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
      // SSRF protection: validate the URL before fetching
      const validatedUrl = await validateWebhookUrl(hook.url)

      const response = await fetch(validatedUrl.href, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': this.userAgent,
          'X-TenantScale-Event': event,
          'X-TenantScale-Signature': signature,
          'X-TenantScale-Delivery': deliveryId,
        },
        body,
        signal: AbortSignal.timeout(this.fetchTimeoutMs),
      })

      const duration = Date.now() - start
      const responseText = await response.text().catch(() => '')

      // Log delivery
      await this.logDelivery(
        hook.id,
        event,
        hook.url,
        null,
        response.status,
        responseText,
        response.ok ? 'delivered' : 'failed',
        response.ok ? null : `HTTP ${response.status}`,
        duration,
      )

      return {
        webhook_id: hook.id,
        status: response.ok ? 'delivered' : 'failed',
        response_status: response.status,
        duration_ms: duration,
        error_message: response.ok ? null : `HTTP ${response.status}`,
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
