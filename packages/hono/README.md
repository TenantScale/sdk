# @tenantscale/hono

**Hono.js middleware adapter for TenantScale** — API key auth, plan enforcement, rate limiting, and audit logging.

## Install

```bash
npm install @tenantscale/hono
# or
pnpm add @tenantscale/hono
```

Requires `@tenantscale/sdk` as a peer dependency.

## Quick Start

```ts
import { Hono } from 'hono'
import { tenantScaleMiddleware } from '@tenantscale/hono'
import { TenantScale } from '@tenantscale/sdk'

const app = new Hono()
const ts = new TenantScale({ supabaseUrl, supabaseKey })

// Apply tenant-scoped middleware
app.use('*', tenantScaleMiddleware(ts))

app.get('/api/resource', (c) => {
  const { tenant } = c.var
  return c.json({ tenantId: tenant.id })
})
```

## Features

- 🔑 API key authentication and scope validation
- 🏢 Tenant context extraction
- 📋 Audit logging middleware
- 🚦 Rate limiting per tenant
- 💳 Plan enforcement
