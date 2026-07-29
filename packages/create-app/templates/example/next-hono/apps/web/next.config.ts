import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // API proxy is handled by app/api/proxy/[...path]/route.ts (BFF pattern).
  // Requests to /api/proxy/* are forwarded to the API server.
  // No additional rewrites() config needed — the catch-all route handles it.
}
export default nextConfig
