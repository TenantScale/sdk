import Link from 'next/link'

export default function Home() {
  return (
    <main style={{ padding: '2rem', maxWidth: 640, margin: '0 auto' }}>
      <h1>🚀 {{projectName}}</h1>
      <p>Your multi-tenant SaaS app is ready.</p>
      <ul>
        <li>API: <code>apps/api/src/index.ts</code></li>
        <li>Web: <code>apps/web/app/</code></li>
        <li>Configure your <code>.env.local</code> with Supabase credentials</li>
      </ul>
      <p>
        <Link href="/health">Health check</Link>
      </p>
    </main>
  )
}
