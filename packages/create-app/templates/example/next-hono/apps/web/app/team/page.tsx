'use client'

import { useTeam } from '@tenantscale/react'
import { useState } from 'react'
import { formatDate } from '@/lib/utils'

export default function TeamPage() {
  const { members, isLoading, inviteMember, removeMember, changeRole } = useTeam()
  const [showInvite, setShowInvite] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')

  if (isLoading) return <p className="text-space-300 text-sm mt-8">Loading...</p>

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    try {
      await inviteMember.execute({ email, role })
      setEmail('')
      setShowInvite(false)
    } catch { /* error handled by hook */ }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Team</h1>
          <p className="text-sm text-space-300">Manage your team members</p>
        </div>
        <button
          onClick={() => setShowInvite(!showInvite)}
          className="rounded-lg bg-cyan px-4 py-2 text-xs font-semibold text-space-950 hover:opacity-90"
        >
          {showInvite ? 'Cancel' : 'Invite Member'}
        </button>
      </div>

      {showInvite && (
        <form onSubmit={handleInvite} className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address" required
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-cyan"
          />
          <select
            value={role} onChange={(e) => setRole(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <button
            type="submit" disabled={inviteMember.isLoading}
            className="rounded-lg bg-cyan px-4 py-2 text-xs font-semibold text-space-950 disabled:opacity-50"
          >
            {inviteMember.isLoading ? 'Sending...' : 'Invite'}
          </button>
        </form>
      )}

      {inviteMember.error && (
        <p className="text-xs text-red-400">{inviteMember.error.message}</p>
      )}

      <div className="rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-space-400">
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members?.map((m) => (
              <tr key={m.id} className="border-b border-white/5 text-space-300">
                <td className="px-4 py-3">{m.email}</td>
                <td className="px-4 py-3">
                  <select
                    value={m.role}
                    onChange={(e) => changeRole.execute({ id: m.id, role: e.target.value })}
                    className="rounded bg-white/5 px-2 py-1 text-xs outline-none"
                    disabled={changeRole.isLoading}
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                    <option value="owner">Owner</option>
                  </select>
                </td>
                <td className="px-4 py-3 text-xs">{formatDate(m.joined_at)}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => removeMember.execute(m.id)}
                    disabled={removeMember.isLoading}
                    className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                  >
                    Remove
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
