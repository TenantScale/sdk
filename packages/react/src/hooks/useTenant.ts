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
// @tenantscale/react — useTenant hook
// ──────────────────────────────────────────────────────

import { useTenantScale } from '../context.js'
import type { UseQueryResult, TenantInfo, UserProfile, PlanInfo, DeploymentInfo } from '../types.js'
import { useMemo } from 'react'

export interface TenantContext {
  user: UserProfile
  tenant: TenantInfo
  plan: PlanInfo
  deployment: DeploymentInfo
}

export function useTenant(): UseQueryResult<TenantContext> & { tenant: TenantContext | null } {
  const { me, isLoading, error, refetch } = useTenantScale()

  const context = useMemo(() => {
    if (!me) return null
    return {
      user: me.user,
      tenant: me.tenant,
      plan: me.plan,
      deployment: me.deployment,
    }
  }, [me])

  return { data: context, tenant: context, error, isLoading, refetch }
}
