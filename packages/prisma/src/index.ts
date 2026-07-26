// ──────────────────────────────────────────────────────
// @tenantscale/prisma — Tenant-safe Prisma ORM helpers
// ──────────────────────────────────────────────────────

/**
 * Options for creating a tenant-scoped Prisma client extension.
 */
export interface TenantScopeOptions {
  /** The tenant ID to scope all queries to */
  tenantId: string
  /** The column name used for tenant isolation (default: 'tenant_id') */
  tenantColumn?: string
}

/**
 * Internal interface for Prisma extension callback arguments.
 * Prisma doesn't export these types publicly, so we define what we need.
 */
interface PrismaExtensionCallbackArgs {
  operation: string
  args: any
  query: (args: any) => Promise<any>
  model: string
}

/**
 * Creates a Prisma client extension that automatically scopes all queries
 * to the specified tenant ID using Prisma's $extends() API.
 *
 * This extension automatically injects WHERE tenant_id = ? clauses into:
 * - findMany(), findFirst(), findUnique()
 * - findFirstOrThrow(), findUniqueOrThrow()
 * - update(), updateMany(), updateOrThrow()
 * - delete(), deleteMany(), deleteOrThrow()
 * - create() (adds tenant_id to data)
 * - createMany() (adds tenant_id to each record)
 * - upsert() (adds tenant_id to where, create, and update)
 * - count(), aggregate(), groupBy()
 *
 * @warning This extension does NOT scope $queryRaw or $executeRaw operations.
 * You must manually add tenant filters to raw SQL queries.
 *
 * @example
 * ```ts
 * import { PrismaClient } from '@prisma/client'
 * import { withTenantScope } from '@tenantscale/prisma'
 *
 * const prisma = new PrismaClient()
 * const tenantPrisma = prisma.$extends(withTenantScope({ tenantId: 'tenant-123' }))
 *
 * // All queries are automatically scoped to tenant-123
 * const users = await tenantPrisma.user.findMany()
 * // Equivalent to: prisma.user.findMany({ where: { tenant_id: 'tenant-123' } })
 *
 * const user = await tenantPrisma.user.create({
 *   data: { name: 'John' }
 *   // tenant_id is automatically added
 * })
 * ```
 *
 * @param options - Tenant scope configuration
 * @returns A Prisma client extension object
 */
export function withTenantScope(options: TenantScopeOptions) {
  const { tenantId, tenantColumn = 'tenant_id' } = options

  if (!tenantId) {
    throw new Error('tenantId is required')
  }

  return {
    name: 'tenantScope',
    query: {
      $allOperations: async ({ operation, args, query }: PrismaExtensionCallbackArgs) => {
        // Skip raw queries - they bypass tenant isolation
        if (operation === '$queryRaw' || operation === '$executeRaw') {
          return query(args)
        }

        // For read operations, inject tenant filter into where clause
        const readOperations = [
          'findMany',
          'findFirst',
          'findUnique',
          'findFirstOrThrow',
          'findUniqueOrThrow',
          'count',
          'aggregate',
          'groupBy',
        ]

        if (readOperations.includes(operation)) {
          args = args || {}
          args.where = {
            ...(args.where || {}),
            [tenantColumn]: tenantId,
          }
        }

        // For update operations, inject tenant filter
        const updateOperations = ['update', 'updateMany', 'updateOrThrow', 'updateManyAndReturn']

        if (updateOperations.includes(operation)) {
          args = args || {}
          args.where = args.where || {}
          args.where[tenantColumn] = tenantId

          // Prevent transferring records between tenants via update
          if (args.data != null && typeof args.data === 'object' && !Array.isArray(args.data)) {
            const existingTenant = args.data[tenantColumn]
            if (existingTenant != null && existingTenant !== tenantId) {
              throw new Error(
                `Cannot update record to a different tenant (${tenantColumn}=${existingTenant}) when scoped to ${tenantId}`,
              )
            }
          }
        }

        // For delete operations, inject tenant filter
        const deleteOperations = ['delete', 'deleteMany', 'deleteOrThrow']

        if (deleteOperations.includes(operation)) {
          args = args || {}
          args.where = args.where || {}
          args.where[tenantColumn] = tenantId
        }

        // For create operations, inject tenant_id into data
        if (['create', 'createMany', 'createManyAndReturn'].includes(operation)) {
          args = args || {}

          // Handle null/undefined data gracefully
          if (args.data == null) {
            args.data = {}
          }

          if (operation === 'create') {
            const existingTenant = args.data[tenantColumn]
            if (existingTenant != null && existingTenant !== tenantId) {
              throw new Error(
                `Cannot create record for a different tenant (${tenantColumn}=${existingTenant}) when scoped to ${tenantId}`,
              )
            }
            args.data = {
              ...args.data,
              [tenantColumn]: tenantId,
            }
          } else {
            // createMany uses data array or single object
            if (Array.isArray(args.data)) {
              args.data = args.data.map((item: any) => {
                if (item == null) return { [tenantColumn]: tenantId }

                const existingTenant = item[tenantColumn]
                if (existingTenant != null && existingTenant !== tenantId) {
                  throw new Error(
                    `Cannot createMany record for a different tenant (${tenantColumn}=${existingTenant}) when scoped to ${tenantId}`,
                  )
                }

                return { ...item, [tenantColumn]: tenantId }
              })
            } else {
              const existingTenant = args.data[tenantColumn]
              if (existingTenant != null && existingTenant !== tenantId) {
                throw new Error(
                  `Cannot createMany record for a different tenant (${tenantColumn}=${existingTenant}) when scoped to ${tenantId}`,
                )
              }
              args.data = {
                ...args.data,
                [tenantColumn]: tenantId,
              }
            }
          }
        }

        // For upsert, inject tenant_id into where, create, and update
        if (operation === 'upsert') {
          args = args || {}
          args.where = args.where || {}
          args.where[tenantColumn] = tenantId

          args.create = args.create || {}
          const existingCreateTenant = args.create[tenantColumn]
          if (existingCreateTenant != null && existingCreateTenant !== tenantId) {
            throw new Error(
              `Cannot upsert (create) record for a different tenant (${tenantColumn}=${existingCreateTenant}) when scoped to ${tenantId}`,
            )
          }
          args.create = {
            ...args.create,
            [tenantColumn]: tenantId,
          }

          args.update = args.update || {}
          const existingUpdateTenant = args.update[tenantColumn]
          if (existingUpdateTenant != null && existingUpdateTenant !== tenantId) {
            throw new Error(
              `Cannot upsert (update) record for a different tenant (${tenantColumn}=${existingUpdateTenant}) when scoped to ${tenantId}`,
            )
          }
          args.update = {
            ...args.update,
            [tenantColumn]: tenantId,
          }
        }

        return query(args)
      },
    },
  }
}

/**
 * Creates a tenant filter object for manual use in Prisma queries.
 * This is useful when you need explicit control over tenant filtering.
 *
 * @example
 * ```ts
 * import { tenantFilter } from '@tenantscale/prisma'
 *
 * const users = await prisma.user.findMany({
 *   where: {
 *     ...tenantFilter('tenant-123'),
 *     status: 'active'
 *   }
 * })
 * ```
 *
 * @param tenantId - The tenant ID to filter by
 * @param column - The column name used for tenant isolation (default: 'tenant_id')
 * @returns A Prisma where filter object
 */
export function tenantFilter(tenantId: string, column = 'tenant_id'): Record<string, unknown> {
  if (!tenantId) {
    throw new Error('tenantId is required')
  }

  return { [column]: tenantId }
}
