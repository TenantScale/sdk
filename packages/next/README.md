# @tenantscale/next

**Next.js App Router adapter for TenantScale** — API key auth, plan enforcement, and audit logging for Route Handlers.

## Install

```bash
npm install @tenantscale/next
# or
pnpm add @tenantscale/next
```

Requires `@tenantscale/sdk` as a peer dependency.

## Quick Start

```ts
// app/api/tenants/route.ts
import { withTenantScale } from '@tenantscale/next'
import { TenantScale } from '@tenantscale/sdk'

const ts = new TenantScale({ supabaseUrl, supabaseKey })

export const GET = withTenantScale(ts, async (req, { tenant, apiKey }) => {
  return Response.json({ tenantId: tenant.id })
})
```

## Features

- 🔑 API key authentication for Route Handlers
- 🏢 Tenant context from API key or session
- 📋 Audit logging via wrapped handlers
- 💳 Plan enforcement middleware

Works with `app/router/route.ts` and `pages/api/` patterns.
