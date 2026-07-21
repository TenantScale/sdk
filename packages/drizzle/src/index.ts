import { eq } from 'drizzle-orm'
import type { SQL, SQLWrapper } from 'drizzle-orm'

/**
 * Creates a tenant filter condition for Drizzle ORM queries.
 *
 * This helper returns a SQL expression that can be combined with other conditions
 * using Drizzle's `and()`, `or()`, etc. operators.
 *
 * @example
 * ```ts
 * import { tenantFilter } from '@tenantscale/drizzle'
 * import { and, eq } from 'drizzle-orm'
 *
 * db.select()
 *   .from(tickets)
 *   .where(and(
 *     eq(tickets.status, 'open'),
 *     tenantFilter(tickets.tenant_id, tenantId)
 *   ))
 * ```
 *
 * @param column - The tenant column from your Drizzle schema (e.g., tickets.tenant_id)
 * @param tenantId - The tenant ID to filter by
 * @returns A SQL expression for the tenant equality condition
 */
export function tenantFilter(column: SQLWrapper, tenantId: string): SQL {
  if (!tenantId) {
    throw new Error('tenantId is required')
  }

  return eq(column, tenantId)
}
