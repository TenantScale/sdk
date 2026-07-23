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
