# @tenantscale/drizzle

Tenant-safe Drizzle ORM helpers for TenantScale.

## Install

```bash
npm install @tenantscale/drizzle
# or
pnpm add @tenantscale/drizzle
```

## Usage

```ts
import { createTenantSafeDrizzle } from '@tenantscale/drizzle'

const db = createTenantSafeDrizzle(drizzle, tenantId)

await db.select().from('tickets').where()
await db.insert().into('tickets').values({ title: 'Hello' })
await db.update().set({ status: 'open' }).where()
await db.delete().from('tickets').where()
```

The helper automatically appends a tenant filter to common query builders using the default column name `tenant_id`.
