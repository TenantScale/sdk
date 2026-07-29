'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [tenantName, setTenantName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    // 1. Create Supabase auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email, password,
      options: { data: { tenant_name: tenantName } },
    })
    if (authError || !authData.user) {
      setError(authError?.message ?? 'Registration failed')
      setLoading(false)
      return
    }

    // 2. Create tenant via API
    try {
      const session = (await supabase.auth.getSession()).data.session
      const res = await fetch('/api/proxy/v1/portal/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          email,
          password,
          tenant_name: tenantName,
          tenant_slug: tenantName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        }),
      })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error ?? 'Failed to create tenant')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tenant')
      setLoading(false)
      return
    }

    router.refresh()
    router.push('/dashboard')
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-white/[0.03] p-8">
        <h1 className="mb-1 text-xl font-bold text-white">Create account</h1>
        <p className="mb-6 text-sm text-space-300">
          Already have one?{' '}
          <a href="/login" className="text-cyan hover:underline">Sign in</a>
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-space-300">Organization name</label>
            <input
              type="text" value={tenantName} onChange={(e) => setTenantName(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-cyan"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-space-300">Email</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-cyan"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-space-300">Password</label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-cyan"
              minLength={8}
              required
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="submit" disabled={loading}
            className="w-full rounded-lg bg-cyan py-2 text-sm font-semibold text-space-950 transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  )
}
