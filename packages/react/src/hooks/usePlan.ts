// ──────────────────────────────────────────────────────
// @tenantscale/react — usePlan hook
// ──────────────────────────────────────────────────────

import { useTenantScale } from '../context.js'
import type { UseQueryResult, PlanInfo } from '../types.js'
import { useMemo } from 'react'

export function usePlan(): UseQueryResult<PlanInfo> & {
  plan: PlanInfo | null
  hasFeature: (feature: string) => boolean
  getLimit: (key: string) => number | null
} {
  const { me, isLoading, error, refetch } = useTenantScale()

  const plan = me?.plan ?? null

  const hasFeature = useMemo(
    () =>
      (feature: string): boolean => {
        if (!plan) return false
        return plan.features[feature] === true
      },
    [plan],
  )

  const getLimit = useMemo(
    () =>
      (key: string): number | null => {
        if (!plan) return null
        return plan.limits?.[key] ?? null
      },
    [plan],
  )

  return { data: plan, plan, isLoading, error, refetch, hasFeature, getLimit }
}
