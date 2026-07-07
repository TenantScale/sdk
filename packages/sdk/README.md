# @tenantscale/sdk

**Framework-agnostic multi-tenant SDK for B2B SaaS** — tenant isolation, audit logging, plan enforcement, and API key management.

## Install

```bash
npm install @tenantscale/sdk
# or
pnpm add @tenantscale/sdk
```

## Quick Start

```ts
import { TenantScale } from '@tenantscale/sdk'

const ts = new TenantScale({
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,      // optional
  sentryDsn: process.env.SENTRY_DSN,                   // optional
})

// Protect an API route
app.use(ts.protect())
app.use(ts.requireScope('admin'))

// Audit an action
ts.audit('user.deleted', { user_id: 'abc-123' }, { actor_type: 'user' })
```

## Exports

| Export | Description |
|--------|-------------|
| `TenantScale` | Main SDK class — protect, audit, plan store, rate limiter |
| `PlanStore` | Tenant plan / feature lookup |
| `RateLimiter` | Sliding-window rate limiter |
| `WebhookDispatcher` | Tenant-scoped webhook delivery |
| `StripeClient` | Stripe billing integration |
| `validateApiKey` | API key validation utility |

## Framework Adapters

This package is framework-agnostic. For framework-specific middleware:

- [@tenantscale/express](https://github.com/TenantScale/sdk/tree/main/packages/express)
- [@tenantscale/hono](https://github.com/TenantScale/sdk/tree/main/packages/hono)
- [@tenantscale/next](https://github.com/TenantScale/sdk/tree/main/packages/next)
- [@tenantscale/react](https://github.com/TenantScale/sdk/tree/main/packages/react)
