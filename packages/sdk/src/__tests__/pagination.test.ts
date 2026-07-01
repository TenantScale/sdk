// ──────────────────────────────────────────────────────
// Pagination — Comprehensive Unit Tests
// ──────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { parsePaginationParams, paginationResponse } from '../pagination.js'

// ── Tests ──

describe('parsePaginationParams', () => {
  // ── Happy Path ──

  // Test: Default values with empty query
  // Category: Happy Path
  // What it proves: When no query params are provided, safe defaults (page=1, limit=50, offset=0) are used
  // Risk if missing: API consumers would get no pagination without explicit params
  it('returns defaults when query is empty', () => {
    const result = parsePaginationParams({})
    expect(result).toEqual({ page: 1, limit: 50, offset: 0 })
  })

  // Test: Both page and limit provided
  // Category: Happy Path
  // What it proves: Explicit page and limit values are used correctly
  // Risk if missing: Explicit user requests for pagination would be ignored
  it('uses provided page and limit values', () => {
    const result = parsePaginationParams({ page: '2', limit: '25' })
    expect(result).toEqual({ page: 2, limit: 25, offset: 25 })
  })

  // Test: Only page provided
  // Category: Happy Path
  // What it proves: When only page is given, limit defaults to 50 and offset is computed
  // Risk if missing: Pagination navigation would break for page-only requests
  it('uses default limit when only page is provided', () => {
    const result = parsePaginationParams({ page: '3' })
    expect(result).toEqual({ page: 3, limit: 50, offset: 100 })
  })

  // Test: Only limit provided
  // Category: Happy Path
  // What it proves: When only limit is given, page defaults to 1
  // Risk if missing: Custom page sizes without page number would break
  it('uses default page when only limit is provided', () => {
    const result = parsePaginationParams({ limit: '10' })
    expect(result).toEqual({ page: 1, limit: 10, offset: 0 })
  })

  // Test: Custom defaultLimit parameter
  // Category: Happy Path
  // What it proves: The caller can override the default limit
  // Risk if missing: Different endpoints can't have different default page sizes
  it('accepts custom defaultLimit parameter', () => {
    const result = parsePaginationParams({}, 25)
    expect(result).toEqual({ page: 1, limit: 25, offset: 0 })
  })

  // Test: Page as string '2'
  // Category: Happy Path
  // What it proves: String numeric values are parsed correctly
  // Risk if missing: Query strings from HTTP (always strings) would fail
  it('parses string numeric page values', () => {
    const result = parsePaginationParams({ page: '2' })
    expect(result.page).toBe(2)
  })

  // Test: Limit as string '25'
  // Category: Happy Path
  // What it proves: String numeric limit values are parsed correctly
  // Risk if missing: Query strings from HTTP would break
  it('parses string numeric limit values', () => {
    const result = parsePaginationParams({ limit: '25' })
    expect(result.limit).toBe(25)
  })

  // Test: URLSearchParams input
  // Category: Happy Path
  // What it proves: URLSearchParams objects work (e.g. from fetch API or Hono)
  // Risk if missing: Only Record input would be supported, breaking URLSearchParams usage
  it('handles URLSearchParams input', () => {
    const params = new URLSearchParams('page=3&limit=20')
    const result = parsePaginationParams(params)
    expect(result).toEqual({ page: 3, limit: 20, offset: 40 })
  })

  // Test: Page = 3, limit = 20 → offset = 40
  // Category: Happy Path
  // What it proves: Offset calculation is correct: (page-1) * limit
  // Risk if missing: Results would start at the wrong position
  it('computes correct offset for page=3, limit=20', () => {
    const result = parsePaginationParams({ page: '3', limit: '20' })
    expect(result.offset).toBe(40)
  })

  // Test: Page = 1, limit = 50 → offset = 0
  // Category: Happy Path
  // What it proves: First page always starts at offset 0
  // Risk if missing: First page could skip results
  it('computes offset=0 for page=1', () => {
    const result = parsePaginationParams({ page: '1', limit: '50' })
    expect(result.offset).toBe(0)
  })

  // ── Unhappy Path ──

  // Test: Page value 0 (clamp to 1)
  // Category: Unhappy Path
  // What it proves: Page 0 is invalid (1-indexed) and gets clamped to 1
  // Risk if missing: Page 0 would cause negative offsets or empty results
  it('clamps page 0 to 1', () => {
    const result = parsePaginationParams({ page: '0', limit: '50' })
    expect(result.page).toBe(1)
    expect(result.offset).toBe(0)
  })

  // Test: Page negative (clamp to 1)
  // Category: Unhappy Path
  // What it proves: Negative page values are clamped to 1
  // Risk if missing: Malicious negative pages could cause negative offsets
  it('clamps negative page to 1', () => {
    const result = parsePaginationParams({ page: '-5', limit: '50' })
    expect(result.page).toBe(1)
    expect(result.offset).toBe(0)
  })

  // Test: Limit negative (clamp to 1)
  // Category: Unhappy Path
  // What it proves: Negative limit is clamped to minimum 1
  // Risk if missing: Negative limits could cause DB errors or infinite results
  it('clamps negative limit to 1', () => {
    const result = parsePaginationParams({ page: '1', limit: '-10' })
    expect(result.limit).toBe(1)
  })

  // Test: Limit > 100 (clamp to MAX_PAGE_LIMIT=100)
  // Category: Unhappy Path
  // What it proves: Limit is capped at MAX_PAGE_LIMIT to prevent abuse
  // Risk if missing: Users could request thousands of records in one page, DoS-ing the server
  it('clamps limit above 100 to MAX_PAGE_LIMIT', () => {
    const result = parsePaginationParams({ page: '1', limit: '500' })
    expect(result.limit).toBe(100)
  })

  // Test: Limit string "abc" (NaN → falls back to minimum 1)
  // Category: Unhappy Path
  // What it proves: Non-numeric limit clamps to minimum of 1
  // Risk if missing: Invalid input would produce NaN, causing DB query failures
  it('clamps non-numeric limit to minimum of 1', () => {
    const result = parsePaginationParams({ page: '1', limit: 'abc' })
    expect(result.limit).toBe(1)
  })

  // Test: Page string "abc" (NaN → falls back to 1)
  // Category: Unhappy Path
  // What it proves: Non-numeric page values fall back to 1
  // Risk if missing: Invalid input would produce NaN, causing unexpected behavior
  it('falls back to page 1 when page is non-numeric', () => {
    const result = parsePaginationParams({ page: 'abc', limit: '25' })
    expect(result.page).toBe(1)
  })

  // Test: Empty query object
  // Category: Unhappy Path
  // What it proves: An empty object (no params) uses defaults
  // Risk if missing: Endpoints without pagination params would fail
  it('handles empty query object', () => {
    const result = parsePaginationParams({})
    expect(result).toEqual({ page: 1, limit: 50, offset: 0 })
  })

  // Test: Zero values
  // Category: Unhappy Path
  // What it proves: Zero values for both page and limit clamp correctly
  // Risk if missing: Zero values on both could cause division by zero downstream
  it('clamps both zero page and zero limit', () => {
    const result = parsePaginationParams({ page: '0', limit: '0' })
    expect(result.page).toBe(1)
    expect(result.limit).toBe(1)
    expect(result.offset).toBe(0)
  })

  // Test: Page with float string
  // Category: Unhappy Path
  // What it proves: parseInt floors decimals, so '2.9' becomes 2
  // Risk if missing: Float page strings could cause unexpected page navigation
  it('handles float page strings (parseInt truncates)', () => {
    const result = parsePaginationParams({ page: '2.9', limit: '25' })
    // parseInt('2.9') = 2
    expect(result.page).toBe(2)
  })

  // Test: Limit with float string
  // Category: Unhappy Path
  // What it proves: parseInt floors decimals for limit too
  // Risk if missing: Float limit strings could cause unexpected behavior
  it('handles float limit strings (parseInt truncates)', () => {
    const result = parsePaginationParams({ page: '1', limit: '25.7' })
    expect(result.limit).toBe(25)
  })

  // Test: URLSearchParams with missing keys
  // Category: Unhappy Path
  // What it proves: URLSearchParams with no 'page' or 'limit' uses defaults
  // Risk if missing: URLSearchParams without keys would behave differently from Record
  it('handles URLSearchParams with missing keys', () => {
    const params = new URLSearchParams('foo=bar')
    const result = parsePaginationParams(params)
    expect(result).toEqual({ page: 1, limit: 50, offset: 0 })
  })
})

// ── paginationResponse ──

describe('paginationResponse', () => {
  // Test: Basic response with page=1, limit=50, total=100
  // Category: Happy Path
  // What it proves: Standard use case produces correct pagination metadata
  // Risk if missing: API consumers wouldn't get pagination info to build UI
  it('returns correct PaginationMeta for standard inputs', () => {
    const result = paginationResponse(1, 50, 100)
    expect(result).toEqual({
      page: 1,
      limit: 50,
      total: 100,
      total_pages: 2,
    })
  })

  // Test: Zero total → total_pages = 0
  // Category: Unhappy Path
  // What it proves: Zero total results in 0 pages (not NaN or 1)
  // Risk if missing: Empty datasets would report 1 page, confusing clients
  it('returns total_pages=0 when total is 0', () => {
    const result = paginationResponse(1, 50, 0)
    expect(result.total_pages).toBe(0)
  })

  // Test: Exact division: 50 total, limit=10 → total_pages=5
  // Category: Happy Path
  // What it proves: When total is evenly divisible by limit, total_pages is exact
  // Risk if missing: Even division would produce wrong page counts
  it('returns exact total_pages when total divides evenly by limit', () => {
    const result = paginationResponse(1, 10, 50)
    expect(result.total_pages).toBe(5)
  })

  // Test: Partial last page: 55 total, limit=10 → total_pages=6
  // Category: Happy Path
  // What it proves: Math.ceil ensures a partial last page is counted
  // Risk if missing: The last page of results would be inaccessible
  it('uses Math.ceil for partial last page', () => {
    const result = paginationResponse(1, 10, 55)
    expect(result.total_pages).toBe(6)
  })

  // Test: Single item: total=1, limit=50 → total_pages=1
  // Category: Happy Path
  // What it proves: One result still shows one page even though limit is larger
  // Risk if missing: Single result datasets might show 0 pages
  it('returns total_pages=1 for single item with larger limit', () => {
    const result = paginationResponse(1, 50, 1)
    expect(result.total_pages).toBe(1)
  })

  // Test: Negative total → handled gracefully (Math.ceil of negative = 0)
  // Category: Error Handling
  // What it proves: Negative total (invalid state) doesn't crash, returns 0 pages
  // Risk if missing: Data bugs causing negative totals would crash pagination
  it('handles negative total gracefully (returns total_pages=0)', () => {
    const result = paginationResponse(1, 50, -1)
    // Math.ceil(-1 / 50) = Math.ceil(-0.02) = 0
    // But the check is total > 0 ? Math.ceil(total / limit) : 0
    expect(result.total_pages).toBe(0)
  })

  // Test: Large values: total=1_000_000, limit=100
  // Category: Happy Path
  // What it proves: Large total values work correctly with Math.ceil
  // Risk if missing: Large datasets would cause overflow or wrong page counts
  it('handles large total values', () => {
    const result = paginationResponse(1, 100, 1_000_000)
    expect(result.total_pages).toBe(10_000)
  })

  // Test: Passes through page and limit values untouched
  // Category: Happy Path
  // What it proves: The input page and limit are preserved in the response
  // Risk if missing: Callers would lose track of which page/limit they queried
  it('preserves input page and limit in response', () => {
    const result = paginationResponse(3, 20, 100)
    expect(result.page).toBe(3)
    expect(result.limit).toBe(20)
  })

  // Test: Large total on exact boundary
  // Category: Happy Path
  // What it proves: Exact division at large scale
  // Risk if missing: Off-by-one errors at scale
  it('handles large exact division', () => {
    const result = paginationResponse(1, 1000, 10000)
    expect(result.total_pages).toBe(10)
  })

  // Test: total_pages = 1 when total <= limit
  // Category: Happy Path
  // What it proves: When results fit on one page, total_pages is 1
  // Risk if missing: Single-page results would show wrong page count
  it('returns total_pages=1 when total is less than or equal to limit', () => {
    expect(paginationResponse(1, 50, 30).total_pages).toBe(1)
    expect(paginationResponse(1, 50, 50).total_pages).toBe(1)
  })

  // Test: Very small limit (1) with many items
  // Category: Happy Path
  // What it proves: Paginating one item per page works
  // Risk if missing: Edge case of page size 1 would break
  it('handles limit=1 with many items', () => {
    const result = paginationResponse(1, 1, 100)
    expect(result.total_pages).toBe(100)
  })
})
