'use client'

import { useApiKeys } from '@tenantscale/react'
import { formatDate } from '@/lib/utils'

export default function ApiKeysPage() {
  const { keys, isLoading, createKey, revokeKey } = useApiKeys()

  if (isLoading) return <p className="text-space-300 text-sm mt-8">Loading...</p>

  async function handleCreate() {
    const label = prompt('Label for the new API key:')
    if (!label) return
    try {
      const key = await createKey.execute({ label })
      // Show the raw key once
      alert(`Your new API key:\n\n${(key as any).raw_key}\n\nSave this — it won't be shown again.`)
    } catch { /* handled */ }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">API Keys</h1>
          <p className="text-sm text-space-300">Manage machine-to-machine access</p>
        </div>
        <button
          onClick={handleCreate}
          disabled={createKey.isLoading}
          className="rounded-lg bg-cyan px-4 py-2 text-xs font-semibold text-space-950 hover:opacity-90 disabled:opacity-50"
        >
          {createKey.isLoading ? 'Creating...' : 'Create Key'}
        </button>
      </div>

      {createKey.error && <p className="text-xs text-red-400">{createKey.error.message}</p>}

      <div className="rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-space-400">
              <th className="px-4 py-3 font-medium">Label</th>
              <th className="px-4 py-3 font-medium">Key</th>
              <th className="px-4 py-3 font-medium">Scopes</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {keys?.map((k) => (
              <tr key={k.id} className="border-b border-white/5 text-space-300">
                <td className="px-4 py-3 font-medium text-white">{k.label}</td>
                <td className="px-4 py-3 font-mono text-xs">{k.key_prefix}...</td>
                <td className="px-4 py-3 text-xs">{k.scopes.join(', ')}</td>
                <td className="px-4 py-3 text-xs">{formatDate(k.created_at)}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => {
                      if (confirm('Revoke this API key? This cannot be undone.')) {
                        revokeKey.execute(k.id)
                      }
                    }}
                    disabled={revokeKey.isLoading}
                    className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
