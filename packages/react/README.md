# @tenantscale/react

**React SDK for TenantScale** — tenant context, plan features, API key management, and audit logging hooks for client components.

## Install

```bash
npm install @tenantscale/react
# or
pnpm add @tenantscale/react
```

## Quick Start

```tsx
import { TenantProvider, useTenantScale } from '@tenantscale/react'

// Wrap your app
function App() {
  return (
    <TenantProvider apiUrl="https://api.tenantscale.com">
      <Dashboard />
    </TenantProvider>
  )
}

// Use hooks
function Dashboard() {
  const { tenant, client, loading } = useTenantScale()

  if (loading) return <div>Loading...</div>

  return <div>Current tenant: {tenant.name}</div>
}
```

## Hooks

| Hook | Description |
|------|-------------|
| `useTenantScale()` | Tenant context, API client, loading state |
| `useClient()` | Low-level `TenantScaleClient` instance |

## Features

- 🏢 Tenant context provider
- 🔑 API key management
- 📋 Audit log viewer
- 💳 Plan and billing info
- 🧩 Built-in loading and error states
