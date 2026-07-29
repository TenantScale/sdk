'use client'

import { useAuditLog } from '@tenantscale/react'
import { formatDate } from '@/lib/utils'

export default function AuditPage() {
  const { events, isLoading, meta, page, hasMore, nextPage, prevPage, goToPage } = useAuditLog()

  if (isLoading && !events?.length) return <p className="text-space-300 text-sm mt-8">Loading...</p>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Audit Log</h1>
        <p className="text-sm text-space-300">Track changes across your tenant</p>
      </div>

      <div className="rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-space-400">
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Resource</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">IP</th>
            </tr>
          </thead>
          <tbody>
            {events?.map((e) => (
              <tr key={e.id} className="border-b border-white/5 text-space-300">
                <td className="px-4 py-3 font-medium text-white">{e.action}</td>
                <td className="px-4 py-3 font-mono text-xs">{e.resource}</td>
                <td className="px-4 py-3 text-xs">{e.actor_type}</td>
                <td className="px-4 py-3 text-xs">{formatDate(e.created_at)}</td>
                <td className="px-4 py-3 font-mono text-xs">{e.ip ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {meta && (
        <div className="flex items-center justify-between text-xs text-space-400">
          <span>Page {meta.page} of {meta.total_pages} ({meta.total} events)</span>
          <div className="flex gap-2">
            <button onClick={prevPage} disabled={page <= 1}
              className="rounded-lg border border-white/10 px-3 py-1.5 disabled:opacity-30 hover:text-white">
              ← Prev
            </button>
            <button onClick={nextPage} disabled={!hasMore}
              className="rounded-lg border border-white/10 px-3 py-1.5 disabled:opacity-30 hover:text-white">
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
