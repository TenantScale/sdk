import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Providers } from '@/components/providers'
import { NavBar } from '@/components/NavBar'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'TenantScale — Multi-Tenant SaaS Starter',
  description: 'Multi-tenant B2B SaaS app built with TenantScale',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <Providers>
          <NavBar />
          <main className="mx-auto max-w-6xl px-4 pt-20 pb-12">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  )
}
