# TenantScale Demo — Multi-Tenant IT Help Desk

**Prove it works. Show it off.**

This demo proves TenantScale's core value proposition:
> **"Add multi-tenancy to any SaaS app in minutes."**

It's a working IT help desk for Managed Service Providers (MSPs) where each client is a **tenant** with their own isolated tickets, users, and plan limits.

## 🎯 What This Demo Proves

| Feature | How The Demo Shows It |
|---------|----------------------|
| **Tenant Isolation** | Switch between `demo_acme` and `demo_globex` — each sees only their own tickets. Globex can't see Acme's tickets and vice versa. |
| **Plan Limits** | Acme Corp is on Pro (1000 tickets). Globex is on Free (10 tickets). Try creating more than 10 tickets as Globex — blocked. |
| **Audit Trail** | Every ticket create/update/delete is logged automatically via `ts.logAudit()`. |
| **Feature Gating** | Acme has Priority Support + SSO badges. Globex doesn't. These are driven by plan features. |
| **Admin View** | `demo_admin` can see all tenants, ticket counts, and plan data. |
| **Middleware Pattern** | One line — `ts.protect()` — enforces tenant isolation on every route. |

## 🚀 Quick Start

```bash
# Already running in the monorepo:
cd demos/help-desk
pnpm dev
```

Open **http://localhost:4000**

## 🔑 Demo API Keys

| Key | Tenant | Plan | Try It |
|-----|--------|------|--------|
| `demo_acme` | Acme Corp | **Pro** | 3 sample tickets, priority support, SSO |
| `demo_globex` | Globex Industries | **Free** | 2 sample tickets, limited features |
| `demo_admin` | MSP Admin | **Business** | Cross-tenant view at `/admin/tenants` |

Enter any key on the login page, or set it as a Bearer token:
```
Authorization: Bearer demo_acme
```

## 🧪 What to Show Buyers

Walk through this sequence:

### 1. Login as `demo_acme` (Acme Corp — Pro plan)
- See the **dashboard**: tenant name, plan badge, feature flags, ticket stats
- Notice **Priority Support** and **SSO** badges in the header
- See 3 support tickets that belong only to Acme

### 2. Click "Globex" in the tenant switcher (or login as `demo_globex`)
- **Different data**: Globex sees only their 2 tickets
- **No priority support badge** — Free plan doesn't include it
- **Different plan limit**: Free = 10 max tickets vs Pro = 1000

### 3. Try creating a ticket as Globex
- Create 8 more tickets as Globex
- On the 11th ticket: **blocked by plan limit**
- The demo shows: *"Ticket limit reached. Upgrade your plan to create more tickets."*

### 4. Login as `demo_admin`
- Visit `/admin/tenants` to see all tenants + their stats
- Proves the platform owner has cross-tenant visibility

### 5. Check the isolation proof
- Visit `/proof/isolation` as any key
- Shows: *"You are viewing as 'Acme Corp'. Total tickets visible: 3. Total tickets in system: 6."*
- **Proves** that Acme cannot see Globex's tickets

## 🏗️ Architecture

```
┌─────────────────────────────────┐
│  Browser (HTML + Tailwind)      │
│  http://localhost:4000           │
└──────────┬──────────────────────┘
           │ Bearer token (API key)
           ▼
┌─────────────────────────────────┐
│  Hono.js Server                 │
│                                 │
│  demoProtect() ← ts.protect()  │ ← Tenant isolation
│  ts.getPlanLimit()              │ ← Plan enforcement
│  ts.logAudit()                  │ ← Audit trail
│  createTenantSafeClient()       │ ← Query Guard pattern
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│  Demo Data Store (in-memory)    │
│  ├── Acme Corp (demo_acme)     │
│  ├── Globex (demo_globex)      │
│  └── MSP Admin (demo_admin)    │
└─────────────────────────────────┘
```

## 📦 What TenantScale Provides

These are real `@tenantscale/sdk` imports used in the demo:

```typescript
import { TenantScale } from '@tenantscale/sdk'
import { createTenantSafeClient } from '@tenantscale/sdk/middleware'

const ts = new TenantScale({ baseUrl: 'http://localhost:3001' })

// One line per middleware
app.use('/api/*', ts.protect())           // 1. Tenant isolation
app.use('/api/*', ts.audit())             // 2. Audit trail

// In route handlers:
const tenant = ts.getTenant(c)            // 3. Current tenant context
const limit = ts.getPlanLimit(c, 'max_tickets')  // 4. Plan limits
await ts.logAudit(c, { action, resource })       // 5. Custom audit

// Query Guard (prevents cross-tenant data leaks):
const safe = createTenantSafeClient(db, tenant.id)
const tickets = await safe.query('SELECT * FROM tickets')
// ^ Automatically scopes to current tenant's data
```

## 🔗 Related

- **Customer Portal**: http://localhost:3003 — tenant self-service (users, API keys, audit)
- **Admin Dashboard**: http://localhost:3002 — cross-tenant management (deprecated, superseded by portal)
- **TenantScale API**: http://localhost:3001 — backend API
