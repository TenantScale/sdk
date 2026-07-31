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
        <a href={`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/health`}>
          Health check
        </a>{' '}
        (API server on port 3001)
      </p>
    </main>
  )
}
