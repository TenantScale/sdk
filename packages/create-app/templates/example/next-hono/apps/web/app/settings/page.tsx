'use client'

import { useTenant } from '@tenantscale/react'

export default function SettingsPage() {
  const { tenant, isLoading } = useTenant()

  if (isLoading) return <p className="text-space-300 text-sm mt-8">Loading...</p>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-space-300">Tenant configuration</p>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
        <h2 className="mb-4 text-sm font-semibold text-white">Tenant Info</h2>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-space-400">Name</dt>
            <dd className="text-white">{tenant?.tenant.name ?? '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-space-400">Slug</dt>
            <dd className="font-mono text-cyan">{tenant?.tenant.slug ?? '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-space-400">Role</dt>
            <dd className="text-white">{tenant?.tenant.role ?? '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-space-400">Deployment</dt>
            <dd className="text-white capitalize">{tenant?.deployment.mode ?? '—'}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
