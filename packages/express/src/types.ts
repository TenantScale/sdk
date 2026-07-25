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
// @tenantscale/express — Types & Express Augmentation
// ──────────────────────────────────────────────────────

import type { Request } from 'express'
import type { TenantScale, ApiKeyInfo, PortalSessionInfo } from '@tenantscale/sdk'

// ── Express Request Augmentation ──

declare global {
  namespace Express {
    interface Request {
      /** Resolved API key info (set by authenticateApiKey middleware) */
      tenantKey?: ApiKeyInfo

      /** Resolved portal session info (set by requirePortalSession middleware) */
      portalSession?: PortalSessionInfo

      /** Resolved tenant ID — populated from either API key or portal session */
      tenantId?: string
    }
  }
}

// ── Adapter Options ──

export interface ExpressAdapterOptions {
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

  /**
   * Header name for forwarding client IP.
   * Checks x-forwarded-for, x-real-ip, then falls back to req.ip.
   * @default 'x-forwarded-for'
   */
  ipHeader?: string
}

// ── Middleware Factory Helpers ──

export type MiddlewareFactory<T = void> = (options: ExpressAdapterOptions) => T
export type AsyncMiddleware = (req: Request, res: Response, next: NextFunction) => Promise<void>

// We use express's own NextFunction
import type { NextFunction, Response } from 'express'

// ── Error Response Shape ──

export interface ErrorResponse {
  error: string
  code: string
  statusCode: number
  details?: Record<string, unknown>
}

// Re-export SDK types for convenience
export type { ApiKeyInfo, PortalSessionInfo }
