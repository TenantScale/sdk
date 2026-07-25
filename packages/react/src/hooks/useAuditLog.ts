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
// @tenantscale/react — useAuditLog hook
// ──────────────────────────────────────────────────────

import { useState, useCallback, useEffect } from 'react'
import { useClient } from '../context.js'
import type { UseQueryResult, AuditEvent, PaginationMeta } from '../types.js'

export interface AuditLogResult extends UseQueryResult<AuditEvent[]> {
  events: AuditEvent[]
  meta: PaginationMeta | null
  page: number
  hasMore: boolean
  goToPage: (page: number) => void
  nextPage: () => void
  prevPage: () => void
}

export function useAuditLog(initialPage = 1, pageSize = 50): AuditLogResult {
  const client = useClient()
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [meta, setMeta] = useState<PaginationMeta | null>(null)
  const [page, setPage] = useState(initialPage)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchLog = useCallback(
    async (p: number) => {
      setIsLoading(true)
      setError(null)
      try {
        const res = await client.getAuditLog(p, pageSize)
        setEvents(res.data)
        setMeta(res.meta)
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
      } finally {
        setIsLoading(false)
      }
    },
    [client, pageSize],
  )

  useEffect(() => {
    fetchLog(page)
  }, [fetchLog, page])

  const goToPage = useCallback((p: number) => setPage(Math.max(1, p)), [])
  const nextPage = useCallback(() => {
    if (meta && page < meta.total_pages) setPage((p) => p + 1)
  }, [meta, page])
  const prevPage = useCallback(() => setPage((p) => Math.max(1, p - 1)), [])

  const hasMore = meta ? page < meta.total_pages : false

  return {
    data: events,
    events,
    meta,
    page,
    hasMore,
    isLoading,
    error,
    refetch: () => fetchLog(page),
    goToPage,
    nextPage,
    prevPage,
  }
}
