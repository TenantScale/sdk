'use client'

import { useTenant, usePlan, useApiKeys } from '@tenantscale/react'
import { cn } from '@/lib/utils'

export default function DashboardPage() {
  const { tenant, isLoading: loadingTenant, error: tenantErr } = useTenant()
  const { plan } = usePlan()
  const { keys, isLoading: loadingKeys } = useApiKeys()

  if (loadingTenant) return <p className="text-space-300 text-sm mt-8">Loading...</p>
  if (tenantErr) return <p className="text-red-400 text-sm mt-8">Failed to load tenant</p>
  if (!tenant) return <p className="text-space-300 text-sm mt-8">Please sign in to view your dashboard.</p>

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">{tenant.tenant.name}</h1>
        <p className="text-sm text-space-300">{tenant.tenant.slug} · {tenant.tenant.role}</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Plan" value={plan?.name ?? 'Free'} />
        <StatCard label="API Keys" value={String(keys?.length ?? 0)} />
        <StatCard label="Role" value={tenant.tenant.role} />
      </div>

      {/* Plan Features */}
      {plan && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="mb-4 text-sm font-semibold text-white">Plan Features</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(plan.features).map(([key, val]) => (
              <div key={key} className="flex items-center gap-2 text-xs text-space-300">
                <span className={cn(val === true ? 'text-green-400' : 'text-space-500')}>
                  {val === true ? '✓' : '○'}
                </span>
                {key.replace(/_/g, ' ')}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <p className="text-xs text-space-400">{label}</p>
      <p className="mt-1 text-lg font-bold text-white">{value}</p>
    </div>
  )
}
