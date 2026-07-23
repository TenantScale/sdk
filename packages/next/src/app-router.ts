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

async function getSessionFromCookies(request: Request, options: NextAdapterOptions) {
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
          const { session, tenantId } = await getSessionFromCookies(request, options)
          return await handler(request, { session, tenantId }, routeParams)
        } catch (err) {
          return errorResponse(err)
        }
      }
    },
  }
}
