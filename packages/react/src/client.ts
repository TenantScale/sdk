// ──────────────────────────────────────────────────────
// @tenantscale/react — API Client
// ──────────────────────────────────────────────────────

import type {
  TenantScaleReactOptions,
  MeResponse,
  PaginatedResponse,
  ApiKey,
  CreatedApiKey,
  TeamMember,
  AuditEvent,
  Webhook,
  WebhookDelivery,
} from './types.js'

export class TenantScaleClient {
  private baseUrl: string
  private fetchImpl: typeof globalThis.fetch
  private getAccessToken: () => string | null
  private cache = new Map<string, { data: unknown; expiry: number }>()

  constructor(options: TenantScaleReactOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.fetchImpl = options.fetch ?? globalThis.fetch
    this.getAccessToken = options.getAccessToken ?? (() => null)
  }

  // ── Internal Helpers ──

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    cacheKey?: string,
  ): Promise<T> {
    // Cache check for GET requests
    if (method === 'GET' && cacheKey) {
      const cached = this.cache.get(cacheKey)
      if (cached && cached.expiry > Date.now()) {
        return cached.data as T
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    const token = this.getAccessToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const url = `${this.baseUrl}${path}`
    const res = await this.fetchImpl(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(errorBody.error ?? `HTTP ${res.status}`)
    }

    // 204 No Content
    if (res.status === 204) {
      return undefined as T
    }

    const data = (await res.json()) as T

    // Cache successful GET responses
    if (method === 'GET' && cacheKey) {
      this.cache.set(cacheKey, { data, expiry: Date.now() + 60_000 })

      // Evict oldest entries when cache exceeds max size (100)
      if (this.cache.size > 100) {
        const entries = [...this.cache.entries()]
        entries.sort(([, a], [, b]) => a.expiry - b.expiry)
        const toDelete = entries.slice(0, this.cache.size - 100)
        for (const [key] of toDelete) {
          this.cache.delete(key)
        }
      }
    }

    return data
  }

  /** Clear all cached responses */
  clearCache(): void {
    this.cache.clear()
  }

  /** Invalidate a specific cache entry */
  invalidate(path: string): void {
    this.cache.delete(`GET:${path}`)
  }

  // ── Session / Tenant ──

  async getMe(): Promise<MeResponse> {
    return this.request<MeResponse>('GET', '/v1/portal/me', undefined, 'GET:/v1/portal/me')
  }

  // ── API Keys ──

  async getApiKeys(): Promise<PaginatedResponse<ApiKey>> {
    return this.request<PaginatedResponse<ApiKey>>(
      'GET',
      '/v1/portal/api-keys',
      undefined,
      'GET:/v1/portal/api-keys',
    )
  }

  async createApiKey(label: string, scopes?: string[]): Promise<CreatedApiKey> {
    const result = await this.request<CreatedApiKey>('POST', '/v1/portal/api-keys', {
      label,
      scopes,
    })
    this.invalidate('/v1/portal/api-keys')
    return result
  }

  async revokeApiKey(id: string): Promise<void> {
    await this.request<void>('DELETE', `/v1/portal/api-keys/${id}`)
    this.invalidate('/v1/portal/api-keys')
  }

  // ── Team ──

  async getTeam(): Promise<PaginatedResponse<TeamMember>> {
    return this.request<PaginatedResponse<TeamMember>>(
      'GET',
      '/v1/portal/team',
      undefined,
      'GET:/v1/portal/team',
    )
  }

  async inviteMember(email: string, role: string): Promise<void> {
    await this.request<void>('POST', '/v1/portal/team/invite', { email, role })
    this.invalidate('/v1/portal/team')
  }

  async removeMember(id: string): Promise<void> {
    await this.request<void>('DELETE', `/v1/portal/team/${id}`)
    this.invalidate('/v1/portal/team')
  }

  async changeMemberRole(id: string, role: string): Promise<void> {
    await this.request<void>('PATCH', `/v1/portal/team/${id}`, { role })
    this.invalidate('/v1/portal/team')
  }

  // ── Audit Log ──

  async getAuditLog(page = 1, limit = 50): Promise<PaginatedResponse<AuditEvent>> {
    return this.request<PaginatedResponse<AuditEvent>>(
      'GET',
      `/v1/portal/audit?page=${page}&limit=${limit}`,
      undefined,
      `GET:/v1/portal/audit?page=${page}&limit=${limit}`,
    )
  }

  // ── Webhooks ──

  async getWebhooks(): Promise<PaginatedResponse<Webhook>> {
    return this.request<PaginatedResponse<Webhook>>(
      'GET',
      '/v1/portal/webhooks',
      undefined,
      'GET:/v1/portal/webhooks',
    )
  }

  async createWebhook(url: string, events: string[], description?: string): Promise<Webhook> {
    const result = await this.request<Webhook>('POST', '/v1/portal/webhooks', {
      url,
      events,
      description,
    })
    this.invalidate('/v1/portal/webhooks')
    return result
  }

  async updateWebhook(
    id: string,
    updates: Partial<{ url: string; events: string[]; description: string; is_active: boolean }>,
  ): Promise<Webhook> {
    const result = await this.request<Webhook>('PATCH', `/v1/portal/webhooks/${id}`, updates)
    this.invalidate('/v1/portal/webhooks')
    return result
  }

  async deleteWebhook(id: string): Promise<void> {
    await this.request<void>('DELETE', `/v1/portal/webhooks/${id}`)
    this.invalidate('/v1/portal/webhooks')
  }

  async getWebhookDeliveries(
    webhookId: string,
    page = 1,
    limit = 50,
  ): Promise<PaginatedResponse<WebhookDelivery>> {
    return this.request<PaginatedResponse<WebhookDelivery>>(
      'GET',
      `/v1/portal/webhooks/${webhookId}/deliveries?page=${page}&limit=${limit}`,
    )
  }
}
