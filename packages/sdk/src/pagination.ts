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
