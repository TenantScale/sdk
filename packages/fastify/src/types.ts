// ──────────────────────────────────────────────────────
// @tenantscale/fastify — Types
// ──────────────────────────────────────────────────────

import type { TenantScale, ApiKeyInfo, PortalSessionInfo } from '@tenantscale/sdk'

export interface FastifyAdapterOptions {
  /** TenantScale SDK instance */
  ts: TenantScale

  /** Automatically log an audit event on successful API key authentication. */
  audit?: boolean

  /** Header name for API key authentication. */
  apiKeyHeader?: string

  /** Header name for portal session authentication. */
  authHeader?: string
}

export interface ErrorResponse {
  error: string
  code: string
  statusCode: number
  details?: Record<string, unknown>
}

export type { ApiKeyInfo, PortalSessionInfo }
