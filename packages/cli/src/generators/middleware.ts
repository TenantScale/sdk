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
// @tenantscale/cli — Middleware Code Generator
// ──────────────────────────────────────────────────────

import type { FrameworkInfo } from '../analyzers/framework.js'
import type { DatabaseInfo } from '../analyzers/database.js'

export interface MiddlewareResult {
  files: { path: string; content: string; description: string }[]
}

/**
 * Generate framework-appropriate tenant middleware files.
 */
export function generateMiddleware(
  framework: FrameworkInfo,
  _database: DatabaseInfo,
  outputDir: string,
): MiddlewareResult {
  const files: MiddlewareResult['files'] = []

  switch (framework.framework) {
    case 'express':
      files.push(expressMiddleware(outputDir))
      break
    case 'hono':
      files.push(honoMiddleware(outputDir))
      break
    case 'nextjs':
      files.push(...nextMiddleware(outputDir))
      break
    default:
      files.push(baseMiddleware(outputDir))
      break
  }

  return { files }
}

function expressMiddleware(outputDir: string) {
  return {
    path: `${outputDir}/tenant-middleware.ts`,
    description: 'Express tenant middleware (uses @tenantscale/express)',
    content: `// ──────────────────────────────────────────────────────
// TenantScale Express Middleware (Generated)
// ──────────────────────────────────────────────────────
// Drop this into your Express app to add multi-tenant isolation.
//
// Usage:
//   import { authenticateApiKey, auditLog } from './tenant-middleware'
//   app.use('/api', authenticateApiKey)
//   app.use('/api', auditLog)

import { TenantScale } from '@tenantscale/sdk'
import {
  authenticateApiKey as tsAuthenticateApiKey,
  requireScope,
  requirePlanLimit,
  rateLimitByApiKey,
  auditLog as tsAuditLog,
  errorHandler,
} from '@tenantscale/express'
import type { ExpressAdapterOptions } from '@tenantscale/express'

// ── TenantScale client ─────────────────────────────────

const ts = new TenantScale({
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  logger: console,
})

const options: ExpressAdapterOptions = { ts }

// ── Middleware ──────────────────────────────────────────

/** Authenticate requests using x-api-key header */
export const authenticateApiKey = tsAuthenticateApiKey(options)

/** Rate limit by API key (respects plan limits) */
export const rateLimit = rateLimitByApiKey(options)

/** Plan enforcement — check feature flags and limits */
export const planCheck = requirePlanLimit(options)

/** Audit logging for all tenant operations */
export const auditLog = tsAuditLog(options)

/** Global error handler for TenantScale errors */
export const tenantErrorHandler = errorHandler

// ── Type augmentation ──────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      tenantKey?: import('@tenantscale/sdk').ApiKeyInfo
    }
  }
}
`,
  }
}

function honoMiddleware(outputDir: string) {
  return {
    path: `${outputDir}/tenant-middleware.ts`,
    description: 'Hono tenant middleware (uses @tenantscale/hono)',
    content: `// ──────────────────────────────────────────────────────
// TenantScale Hono Middleware (Generated)
// ──────────────────────────────────────────────────────
//
// Usage:
//   import { authenticateApiKey, auditLog } from './tenant-middleware'
//   app.use('/api/*', authenticateApiKey)

import { TenantScale } from '@tenantscale/sdk'
import {
  authenticateApiKey as tsAuthenticateApiKey,
  requireScope,
  requirePlanLimit,
  rateLimitByApiKey,
  auditLog as tsAuditLog,
  errorHandler,
} from '@tenantscale/hono'
import type { HonoAdapterOptions } from '@tenantscale/hono'

// ── TenantScale client ─────────────────────────────────

const ts = new TenantScale({
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  logger: console,
})

const options: HonoAdapterOptions = { ts }

// ── Middleware ──────────────────────────────────────────

/** Authenticate requests using x-api-key header */
export const authenticateApiKey = tsAuthenticateApiKey(options)

/** Rate limit by API key (respects plan limits) */
export const rateLimit = rateLimitByApiKey(options)

/** Plan enforcement */
export const planCheck = requirePlanLimit(options)

/** Audit logging */
export const auditLog = tsAuditLog(options)

/** Global error handler */
export const tenantErrorHandler = errorHandler

// ── Type augmentation ──────────────────────────────────

declare module 'hono' {
  interface ContextVariableMap {
    tenantKey?: import('@tenantscale/sdk').ApiKeyInfo
  }
}
`,
  }
}

function nextMiddleware(outputDir: string) {
  return [
    {
      path: `${outputDir}/tenant-middleware.ts`,
      description: 'Next.js tenant middleware (uses @tenantscale/next)',
      content: `// ──────────────────────────────────────────────────────
// TenantScale Next.js Middleware (Generated)
// ──────────────────────────────────────────────────────
//
// Usage in route.ts:
//   import { withApiKey } from './tenant-middleware'
//   export const GET = withApiKey(async (req, context) => {
//     const tenantKey = context.tenantKey
//     // ...
//   })

import { TenantScale } from '@tenantscale/sdk'
import { withApiKey, withSession, errorHandler } from '@tenantscale/next'

// ── TenantScale client ─────────────────────────────────

const ts = new TenantScale({
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  logger: console,
})

// ── Route wrappers ─────────────────────────────────────

/** Wrap an API route with tenant API key authentication */
export const apiKeyRoute = (handler: Parameters<typeof withApiKey>[1]) =>
  withApiKey(ts, handler)

/** Wrap an API route with Supabase portal session */
export const sessionRoute = (handler: Parameters<typeof withSession>[1]) =>
  withSession(ts, handler)

/** Global error handler */
export { errorHandler }
`,
    },
    {
      path: `${outputDir}/middleware.ts`,
      description: 'Next.js Edge middleware for path-based routing',
      content: `// ──────────────────────────────────────────────────────
// TenantScale Next.js Edge Middleware (Generated)
// ──────────────────────────────────────────────────────
// This file goes in src/middleware.ts (App Router).
// It redirects unauthenticated users to the login page.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const session = request.cookies.get('sb-session')
  const isAuthPage = request.nextUrl.pathname.startsWith('/login')
  const isApiRoute = request.nextUrl.pathname.startsWith('/api')

  // Allow API routes — they handle auth internally
  if (isApiRoute) return NextResponse.next()

  // Allow auth pages
  if (isAuthPage) return NextResponse.next()

  // Redirect to login if no session
  if (!session || !session.value) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', request.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
`,
    },
  ]
}

function baseMiddleware(outputDir: string) {
  return {
    path: `${outputDir}/tenant-middleware.ts`,
    description: 'Generic tenant middleware (uses @tenantscale/sdk directly)',
    content: `// ──────────────────────────────────────────────────────
// TenantScale Generic Middleware (Generated)
// ──────────────────────────────────────────────────────
//
// This is a framework-agnostic middleware template.
// Adapt it to your server framework of choice.

import { TenantScale } from '@tenantscale/sdk'

// ── TenantScale client ─────────────────────────────────

const ts = new TenantScale({
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  logger: console,
})

// ── Auth Helpers ───────────────────────────────────────

/**
 * Validate an API key and return tenant info.
 * Usage in your route handler:
 *   const apiKey = await validateRequestApiKey(req.headers['x-api-key'])
 */
export async function validateRequestApiKey(apiKeyHeader: string | undefined) {
  if (!apiKeyHeader) {
    return { ok: false as const, error: 'Missing x-api-key header' }
  }

  try {
    const info = await ts.validateApiKey(apiKeyHeader)
    return { ok: true as const, data: info }
  } catch (err) {
    return { ok: false as const, error: String(err) }
  }
}

/**
 * Check if the current tenant has plan access to a feature.
 */
export async function checkFeatureAccess(tenantId: string, feature: string) {
  try {
    const planInfo = await ts.getPlan(tenantId)
    return {
      ok: true,
      available: planInfo.features[feature] === true || planInfo.features[feature] === undefined,
      plan: planInfo,
    }
  } catch (err) {
    return { ok: false, available: false, error: String(err) }
  }
}

export { TenantScale }
export default ts
`,
  }
}
