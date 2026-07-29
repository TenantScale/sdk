'use client'

import { TenantProvider } from '@tenantscale/react'
import type { ReactNode } from 'react'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <TenantProvider
      baseUrl="/api/proxy"
      getAccessToken={() => {
        try {
          const cookies = document.cookie
          const match = cookies.match(/(?:^|;\s*)sb-access-token=([^;]+)/)
          return match?.[1] ?? null
        } catch {
          return null
        }
      }}
    >
      {children}
    </TenantProvider>
  )
}
