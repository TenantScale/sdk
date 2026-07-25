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
// @tenantscale/next — Authentication Functions
// ──────────────────────────────────────────────────────
//
// Raw auth functions that accept a standard Request (or NextRequest)
// and return the resolved context, throwing TenantScaleError on failure.
//
// Use these directly for custom composition, or use the handler wrappers
// in handler.ts for declarative route protection.

import type { ApiKeyInfo, PortalSessionInfo } from '@tenantscale/sdk'
import { AuthenticationError } from '@tenantscale/sdk'
import type { NextAdapterOptions } from './types.js'

// ── Helper: get header value (case-insensitive) ──

function getHeader(request: Request, name: string): string | null {
  return request.headers.get(name)
}

// ── API Key Authentication ──

/**
 * Validates the API key from the request and returns resolved key info.
 *
 * Reads from `x-api-key` header (configurable via `apiKeyHeader` option).
 * Throws `AuthenticationError` if the header is missing or the key is invalid.
 *
 * Usage:
 * ```ts
 * const { apiKey, tenantId } = await authenticateApiKey(req, { ts })
 * ```
 */
export async function authenticateApiKey(
  request: Request,
  options: NextAdapterOptions,
): Promise<{ apiKey: ApiKeyInfo; tenantId: string }> {
  const headerName = options.apiKeyHeader ?? 'x-api-key'
  const token = getHeader(request, headerName)

  if (!token) {
    throw new AuthenticationError(`Missing ${headerName} header`)
  }

  const apiKey = await options.ts.validateApiKey(token)

  return { apiKey, tenantId: apiKey.tenant_id }
}

// ── Portal Session Authentication ──

/**
 * Validates the portal session JWT from the request and returns session info.
 *
 * Reads `Authorization: Bearer <token>` header (configurable via `authHeader` option).
 * Throws `AuthenticationError` if the header is missing or the session is invalid.
 *
 * Usage:
 * ```ts
 * const { session, tenantId } = await requirePortalSession(req, { ts })
 * ```
 */
export async function requirePortalSession(
  request: Request,
  options: NextAdapterOptions,
): Promise<{ session: PortalSessionInfo; tenantId: string | null }> {
  const headerName = options.authHeader ?? 'authorization'
  const authHeaderValue = getHeader(request, headerName)

  if (!authHeaderValue) {
    throw new AuthenticationError(`Missing ${headerName} header`)
  }

  const parts = authHeaderValue.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    throw new AuthenticationError('Invalid authorization header format. Expected: Bearer <token>')
  }

  const session = await options.ts.validateSession(parts[1])

  return { session, tenantId: session.tenant_id }
}
