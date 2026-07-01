// ──────────────────────────────────────────────────────
// Pagination utilities — framework-agnostic
// ──────────────────────────────────────────────────────
// Takes a plain query params object instead of framework-specific request objects.

import type { PaginationParams, PaginationMeta } from './types.js'

const MAX_PAGE_LIMIT = 100
const DEFAULT_PAGE_LIMIT = 50

/**
 * Parse pagination parameters from a query string object.
 *
 * @param query - Query params object (e.g. `req.query` from Express, `c.req.query()` from Hono, `URL.searchParams`)
 * @param defaultLimit - Default items per page (default: 50)
 * @returns Parsed pagination params
 */
export function parsePaginationParams(
  query: Record<string, string | undefined> | URLSearchParams,
  defaultLimit = DEFAULT_PAGE_LIMIT,
): PaginationParams {
  let pageStr: string | undefined
  let limitStr: string | undefined

  if (query instanceof URLSearchParams) {
    pageStr = query.get('page') ?? undefined
    limitStr = query.get('limit') ?? undefined
  } else {
    pageStr = query['page']
    limitStr = query['limit']
  }

  const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1)
  const parsedLimit = parseInt(limitStr ?? '', 10)
  const limit = Math.min(
    isNaN(parsedLimit) || parsedLimit < 1 ? Math.min(defaultLimit, MAX_PAGE_LIMIT) : parsedLimit,
    MAX_PAGE_LIMIT,
  )
  const offset = (page - 1) * limit
  return { page, limit, offset }
}

/**
 * Build the pagination response object from query results.
 */
export function paginationResponse(page: number, limit: number, total: number): PaginationMeta {
  return {
    page,
    limit,
    total,
    total_pages: total > 0 ? Math.ceil(total / limit) : 0,
  }
}
