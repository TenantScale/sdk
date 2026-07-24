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
// @tenantscale/next — Types
// ──────────────────────────────────────────────────────

import type { TenantScale, ApiKeyInfo, PortalSessionInfo } from '@tenantscale/sdk'

// ── Next.js Adapter Options ──

export interface NextAdapterOptions {
  /** TenantScale SDK instance */
  ts: TenantScale

  /**
   * Automatically log an audit event on successful API key authentication.
   * @default true
   */
  audit?: boolean

  /**
   * Header name for API key authentication.
   * @default 'x-api-key'
   */
  apiKeyHeader?: string

  /**
   * Header name for portal session authentication.
   * @default 'authorization'
   */
  authHeader?: string
}

// ── Route Handler Contexts ──

export interface ApiKeyContext {
  apiKey: ApiKeyInfo
  tenantId: string
}

export interface SessionContext {
  session: PortalSessionInfo
  tenantId: string | null
}

// ── Route Handler Config ──

export interface RouteHandlerConfig {
  /**
   * Authentication strategy. Required unless the route is public.
   */
  auth?: 'api-key' | 'session'

  /**
   * Optional scope(s) to require after API key auth.
   */
  scope?: string[]

  /**
   * Optional role(s) to require after session auth.
   */
  roles?: string[]

  /**
   * Optional plan limit check.
   * Pass a feature string (e.g. 'max_tenants') to check against
   * a static count, or an object with a dynamic counter function.
   */
  planLimit?: string | PlanLimitConfig
}

export interface PlanLimitConfig {
  feature: string
  getCount: (request: Request) => number | Promise<number>
}

// ── Route Params (match Next.js signature) ──

export interface RouteParams {
  params: Promise<Record<string, string>>
}

// ── Error Response Shape ──

export interface ErrorResponse {
  error: string
  code: string
  statusCode: number
  details?: Record<string, unknown>
}

// Re-export SDK types for convenience
export type { ApiKeyInfo, PortalSessionInfo }
