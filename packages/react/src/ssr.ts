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
// @tenantscale/react — Server-Side Helpers
// ──────────────────────────────────────────────────────
//
// Use these in Next.js RSC / getServerSideProps / loaders.
//
// ```ts
// // app/dashboard/page.tsx (Server Component)
// import { cookies } from 'next/headers'
// import { getTenantSsr } from '@tenantscale/react'
//
// export default async function DashboardPage() {
//   const ctx = await getTenantSsr(
//     process.env.NEXT_PUBLIC_API_URL!,
//     cookies().toString()
//   )
//   return <div>Hello {ctx.tenant.name}</div>
// }
// ```

import type { TenantSsrContext } from './types.js'

interface SsrResponse {
  user: { id: string; email: string }
  tenant: { id: string; name: string; slug: string; role: string; is_super_admin: boolean }
  plan: {
    id: string
    name: string
    price_monthly: number
    features: Record<string, unknown>
    limits: Record<string, number | null>
  }
  deployment: { mode: 'self_hosted' | 'cloud' }
}

/**
 * Fetch tenant context on the server.
 * Pass the Cookie header from the incoming request so auth cookies
 * are forwarded to the TenantScale API.
 *
 * Returns null when unauthenticated (for pages that show a logged-out view).
 * Throws on network errors so you can surface 5xx to the user.
 */
export async function getTenantSsr(
  baseUrl: string,
  cookieString: string,
  customFetch?: typeof globalThis.fetch,
): Promise<TenantSsrContext | null> {
  const url = `${baseUrl.replace(/\/+$/, '')}/v1/portal/me`
  const fetcher = customFetch ?? globalThis.fetch

  const res = await fetcher(url, {
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieString,
    },
  })

  // 401 = unauthenticated — return null instead of throwing
  if (res.status === 401) {
    return null
  }

  if (!res.ok) {
    throw new Error(`TenantScale SSR: HTTP ${res.status} from ${url}`)
  }

  const data = (await res.json()) as SsrResponse

  return {
    user: data.user,
    tenant: data.tenant,
    plan: data.plan,
    deployment: data.deployment,
  }
}

/**
 * Convenience wrapper for Next.js App Router pages:
 * extracts the Cookie header from the request object.
 *
 * ```ts
 * // app/dashboard/page.tsx
 * import { headers } from 'next/headers'
 * import { getTenantSsrFromHeaders } from '@tenantscale/react'
 *
 * export default async function Page() {
 *   const ctx = await getTenantSsrFromHeaders(
 *     process.env.NEXT_PUBLIC_API_URL!,
 *     headers()
 *   )
 * }
 * ```
 */
export async function getTenantSsrFromHeaders(
  baseUrl: string,
  headers: Headers | { get(name: string): string | null },
): Promise<TenantSsrContext | null> {
  const cookie = headers.get('cookie') ?? ''
  return getTenantSsr(baseUrl, cookie)
}
