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
// @tenantscale/next — App Router helpers
// ──────────────────────────────────────────────────────

import { cookies } from 'next/headers'
import { AuthenticationError } from '@tenantscale/sdk'
import { errorResponse } from './error-handler.js'
import type { NextAdapterOptions, SessionContext, RouteParams } from './types.js'

export interface AppRouterHandlerFactory {
  withSession: (
    handler: (
      request: Request,
      context: SessionContext,
      routeParams: RouteParams,
    ) => Response | Promise<Response>,
  ) => (request: Request, routeParams: RouteParams) => Promise<Response>
}

async function getSessionFromCookies(options: NextAdapterOptions) {
  const cookieStore = await cookies()
  const cookie = cookieStore.get('tenant_session')
  if (!cookie?.value) {
    throw new AuthenticationError('Missing tenant_session cookie')
  }

  const session = await options.ts.validateSession(cookie.value)
  return { session, tenantId: session.tenant_id }
}

export function createAppRouterHandler(options: NextAdapterOptions): AppRouterHandlerFactory {
  return {
    withSession(handler) {
      return async (request, routeParams) => {
        try {
          const { session, tenantId } = await getSessionFromCookies(options)
          return await handler(request, { session, tenantId }, routeParams)
        } catch (err) {
          return errorResponse(err)
        }
      }
    },
  }
}
