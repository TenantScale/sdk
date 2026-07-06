// ──────────────────────────────────────────────────────
// @tenantscale/koa — Types
// ──────────────────────────────────────────────────────

import type { TenantScale, ApiKeyInfo, PortalSessionInfo } from '@tenantscale/sdk'

export interface KoaAdapterOptions {
  ts: TenantScale
  audit?: boolean
  apiKeyHeader?: string
  authHeader?: string
}

export interface ErrorResponse {
  error: string
  code: string
  statusCode: number
  details?: Record<string, unknown>
}

export type { ApiKeyInfo, PortalSessionInfo }
