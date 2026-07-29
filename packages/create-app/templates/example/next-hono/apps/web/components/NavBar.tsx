'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTenant } from '@tenantscale/react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '▦' },
  { href: '/team', label: 'Team', icon: '👥' },
  { href: '/api-keys', label: 'API Keys', icon: '🔑' },
  { href: '/audit', label: 'Audit Log', icon: '📋' },
  { href: '/settings', label: 'Settings', icon: '⚙' },
]

export function NavBar() {
  const pathname = usePathname()
  const { tenant } = useTenant()

  if (pathname === '/login' || pathname === '/register') return null

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-space-950/85 backdrop-blur-xl border-b border-white/5">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-sm font-bold text-white">
            <span className="text-cyan">Tenant</span>Scale
          </Link>
          <div className="flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  pathname === item.href
                    ? 'bg-cyan/10 text-cyan'
                    : 'text-space-300 hover:text-white',
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-space-300">
          {tenant && (
            <span className="rounded-full bg-cyan/10 px-2.5 py-0.5 text-cyan">
              {tenant.tenant.name}
            </span>
          )}
          <form action="/auth/logout" method="POST">
            <button type="submit" className="hover:text-white transition-colors">
              Logout
            </button>
          </form>
        </div>
      </div>
    </nav>
  )
}
