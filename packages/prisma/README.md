# @tenantscale/prisma

Top-level tenant-scoping helpers for Prisma ORM with documented limitations.

## Install

```bash
npm install @tenantscale/prisma
# or
pnpm add @tenantscale/prisma
```

## Usage

This package provides two approaches for tenant-scoped Prisma queries:

### 1. Automatic Query Scoping with `withTenantScope`

The recommended approach uses Prisma's `$extends()` API to automatically inject tenant filters into all queries. This prevents cross-tenant data leaks by ensuring every query is scoped to the current tenant.

```ts
import { PrismaClient } from '@prisma/client'
import { withTenantScope } from '@tenantscale/prisma'

const prisma = new PrismaClient()

// Create a tenant-scoped client
const tenantPrisma = prisma.$extends(withTenantScope({ tenantId: 'tenant-123' }))

// All queries are automatically scoped to tenant-123
const users = await tenantPrisma.user.findMany()
// Equivalent to: prisma.user.findMany({ where: { tenant_id: 'tenant-123' } })

// Create operations automatically include tenant_id
const user = await tenantPrisma.user.create({
  data: { name: 'John', email: 'john@example.com' }
  // tenant_id is automatically added: { name: 'John', email: 'john@example.com', tenant_id: 'tenant-123' }
})

// Update operations automatically include tenant filter
const updated = await tenantPrisma.user.update({
  where: { id: 'user-1' },
  data: { name: 'John Updated' }
  // Automatically becomes: { where: { id: 'user-1', tenant_id: 'tenant-123' }, ... }
})

// Delete operations automatically include tenant filter
await tenantPrisma.user.delete({
  where: { id: 'user-1' }
  // Automatically becomes: { where: { id: 'user-1', tenant_id: 'tenant-123' } }
})
```

**Supported Operations:**
- `findMany()`, `findFirst()`, `findUnique()` - auto-adds `WHERE tenant_id = ?`
- `update()`, `updateMany()` - auto-adds `WHERE tenant_id = ?`
- `delete()`, `deleteMany()` - auto-adds `WHERE tenant_id = ?`
- `create()`, `createMany()` - auto-adds `tenant_id` to data
- `upsert()` - auto-adds `tenant_id` to where, create, and update

### 2. Manual Filtering with `tenantFilter`

For explicit control, use the `tenantFilter` helper to manually add tenant conditions to your queries:

```ts
import { tenantFilter } from '@tenantscale/prisma'

// Select with tenant filter
const users = await prisma.user.findMany({
  where: {
    ...tenantFilter('tenant-123'),
    status: 'active'
  }
})

// Update with tenant filter
await prisma.user.update({
  where: {
    id: 'user-1',
    ...tenantFilter('tenant-123')
  },
  data: { status: 'inactive' }
})

// Delete with tenant filter
await prisma.user.deleteMany({
  where: tenantFilter('tenant-123')
})
```

### Custom Tenant Column

If your schema uses a different column name for tenant isolation:

```ts
import { withTenantScope } from '@tenantscale/prisma'

const tenantPrisma = prisma.$extends(
  withTenantScope({ 
    tenantId: 'tenant-123', 
    tenantColumn: 'organization_id' 
  })
)

// Or with tenantFilter
import { tenantFilter } from '@tenantscale/prisma'

const filter = tenantFilter('tenant-123', 'organization_id')
```

## Integration with TenantScale

Combine with the TenantScale SDK for complete multi-tenant isolation:

```ts
import { PrismaClient } from '@prisma/client'
import { TenantScale } from '@tenantscale/sdk'
import { withTenantScope } from '@tenantscale/prisma'

const ts = new TenantScale({
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
})

const prisma = new PrismaClient()

// In your API route handler
app.post('/api/users', async (req, res) => {
  // Validate API key
  const apiKey = await ts.validateApiKey(req.headers.authorization)
  
  // Create tenant-scoped Prisma client
  const tenantPrisma = prisma.$extends(
    withTenantScope({ tenantId: apiKey.tenant_id })
  )
  
  // All queries are automatically scoped to the authenticated tenant
  const users = await tenantPrisma.user.findMany()
  
  res.json(users)
})
```

## Design

This package leverages Prisma 5+'s native `$extends()` API for clean, type-safe query modification:

- **Automatic injection**: The `withTenantScope` extension automatically adds tenant filters to all top-level operations.
- **No schema modification**: Works with your existing Prisma schema - just ensure your tables have a `tenant_id` column (or custom column name).
- **Type safety**: The Prisma client remains type-safe, but the extension callback args are intentionally typed as `any` (Prisma does not export all needed callback types).
- **Explicit fallback**: The `tenantFilter` helper is available for cases where you need manual control over tenant filtering.

## Error Handling

Both helpers throw an error if `tenantId` is empty or undefined:

```ts
withTenantScope({ tenantId: '' }) // Throws: tenantId is required
tenantFilter('') // Throws: tenantId is required
```

## Limitations

- For `findUnique`, `update`, and `delete` operations, the tenant filter is added to the where clause. Ensure your unique constraints include the tenant column for proper isolation (e.g., `@@unique([id, tenant_id])`). If your schema does not have composite unique constraints, these operations will throw a Prisma runtime error.
- **Nested Reads and Writes are not scoped**: The extension intercepts operations at the top level. Nested relations (e.g., nested `include`, `select`, or nested `create`/`update` payloads) are **not** automatically tenant-scoped.
- **Raw Queries**: The extension does not modify raw SQL queries executed via `$queryRaw` or `$executeRaw`, nor does it support MongoDB raw operations (`findRaw`, `aggregateRaw`).
- **Recommendation**: This package provides convenient top-level scoping. Applications requiring true structural, foolproof tenant isolation should use database-level security mechanisms such as PostgreSQL Row Level Security (RLS).

## Testing

The package includes comprehensive tests covering all Prisma operations:

```bash
pnpm test
```

## License

MIT
