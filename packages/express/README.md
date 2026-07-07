# @tenantscale/express

**Express.js middleware adapter for TenantScale** — API key auth, plan enforcement, rate limiting, and audit logging.

## Install

```bash
npm install @tenantscale/express
# or
pnpm add @tenantscale/express
```

Requires `@tenantscale/sdk` as a peer dependency.

## Quick Start

```ts
import express from 'express'
import { tenantScaleMiddleware } from '@tenantscale/express'
import { TenantScale } from '@tenantscale/sdk'

const app = express()
const ts = new TenantScale({ supabaseUrl, supabaseKey })

// Apply tenant-scoped middleware
app.use(tenantScaleMiddleware(ts))

app.get('/api/resource', (req, res) => {
  // req.tenant, req.apiKey available
  res.json({ tenantId: req.tenant.id })
})

app.listen(3001)
```

## Features

- 🔑 API key authentication and scope validation
- 🏢 Tenant context extraction
- 📋 Audit logging middleware
- 🚦 Rate limiting per tenant
- 💳 Plan enforcement
