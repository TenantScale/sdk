/*
 * MIT License
 *
 * Copyright (c) 2026 TenantScale
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

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
      $allOperations: async ({ args, query }: PrismaExtensionCallbackArgs) => {
        // Skip raw queries - they bypass tenant isolation
        if (args.operation === '$queryRaw' || args.operation === '$executeRaw') {
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

        if (readOperations.includes(args.operation)) {
          args.args = args.args || {}
          args.args.where = args.args.where || {}

          // Merge tenant filter with existing where clause
          args.args.where = {
            ...args.args.where,
            [tenantColumn]: tenantId,
          }
        }

        // For update operations, inject tenant filter
        const updateOperations = ['update', 'updateMany', 'updateOrThrow']

        if (updateOperations.includes(args.operation)) {
          args.args = args.args || {}
          args.args.where = args.args.where || {}
          args.args.where[tenantColumn] = tenantId
        }

        // For delete operations, inject tenant filter
        const deleteOperations = ['delete', 'deleteMany', 'deleteOrThrow']

        if (deleteOperations.includes(args.operation)) {
          args.args = args.args || {}
          args.args.where = args.args.where || {}
          args.args.where[tenantColumn] = tenantId
        }

        // For create operations, inject tenant_id into data
        if (['create', 'createMany'].includes(args.operation)) {
          args.args = args.args || {}

          // Handle null/undefined data gracefully
          if (args.args.data == null) {
            args.args.data = {}
          }

          if (args.operation === 'create') {
            // Merge tenant_id with existing data, don't overwrite if already present
            if (!(tenantColumn in args.args.data)) {
              args.args.data = {
                ...args.args.data,
                [tenantColumn]: tenantId,
              }
            }
          } else {
            // createMany uses data array or single object
            if (Array.isArray(args.args.data)) {
              args.args.data = args.args.data.map((item: any) => {
                if (item == null) return { [tenantColumn]: tenantId }
                if (!(tenantColumn in item)) {
                  return { ...item, [tenantColumn]: tenantId }
                }
                return item
              })
            } else {
              if (!(tenantColumn in args.args.data)) {
                args.args.data = {
                  ...args.args.data,
                  [tenantColumn]: tenantId,
                }
              }
            }
          }
        }

        // For upsert, inject tenant_id into where, create, and update
        if (args.operation === 'upsert') {
          args.args = args.args || {}
          args.args.where = args.args.where || {}
          args.args.where[tenantColumn] = tenantId

          args.args.create = args.args.create || {}
          if (!(tenantColumn in args.args.create)) {
            args.args.create = {
              ...args.args.create,
              [tenantColumn]: tenantId,
            }
          }

          args.args.update = args.args.update || {}
          if (!(tenantColumn in args.args.update)) {
            args.args.update = {
              ...args.args.update,
              [tenantColumn]: tenantId,
            }
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
