# @tenantscale/drizzle

Tenant-safe Drizzle ORM helpers for TenantScale.

## Install

```bash
npm install @tenantscale/drizzle
# or
pnpm add @tenantscale/drizzle
```

## Usage

This package provides a `tenantFilter` helper that creates a Drizzle SQL expression for filtering queries by tenant ID. It works with Drizzle's expression-based query builder and can be combined with other conditions using `and()`, `or()`, etc.

```ts
import { tenantFilter } from '@tenantscale/drizzle'
import { and, eq } from 'drizzle-orm'

// Select with tenant filter
const tickets = await db
  .select()
  .from(tickets)
  .where(tenantFilter(tickets.tenant_id, tenantId))

// Combine with other conditions
const openTickets = await db
  .select()
  .from(tickets)
  .where(and(
    eq(tickets.status, 'open'),
    tenantFilter(tickets.tenant_id, tenantId)
  ))

// Update with tenant filter
await db
  .update(tickets)
  .set({ status: 'closed' })
  .where(and(
    eq(tickets.id, ticketId),
    tenantFilter(tickets.tenant_id, tenantId)
  ))

// Delete with tenant filter
await db
  .delete(tickets)
  .where(tenantFilter(tickets.tenant_id, tenantId))
```

## Design

This package takes a deliberately scoped approach:

- **Proxy-based approach rejected**: The initial design used a Proxy to automatically inject tenant filters, but this doesn't work with Drizzle's expression-based API where `.where()` expects SQL expressions like `eq(col, val)`, not column/value tuples.
- **Explicit filtering**: The `tenantFilter` helper returns a proper Drizzle SQL expression that you explicitly include in your queries. This ensures compatibility with Drizzle's actual API.
- **No magic**: Users must explicitly add the tenant filter to their queries, which makes the behavior clear and predictable.

## Limitations

- This helper only provides the tenant filter expression. It does not automatically inject tenant filters into queries.
- Users must remember to include `tenantFilter` in every query that should be tenant-scoped.
- For insert operations, you must manually add the tenant ID to the values object (this is not handled by the helper).

## Error Handling

The helper throws an error if `tenantId` is empty or undefined:

```ts
tenantFilter(tickets.tenant_id, '') // Throws: tenantId is required
```
