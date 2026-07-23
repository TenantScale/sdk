// ──────────────────────────────────────────────────────
// @tenantscale/react — useWebhooks hook
// ──────────────────────────────────────────────────────

import { useState, useCallback, useEffect } from 'react'
import { useClient } from '../context.js'
import type { UseQueryResult, UseMutationResult, Webhook, WebhookDelivery } from '../types.js'

export function useWebhooks(): UseQueryResult<Webhook[]> & {
  webhooks: Webhook[]
  createWebhook: UseMutationResult<{ url: string; events: string[]; description?: string }, Webhook>
  updateWebhook: UseMutationResult<
    {
      id: string
      updates: Partial<{ url: string; events: string[]; description: string; is_active: boolean }>
    },
    Webhook
  >
  deleteWebhook: UseMutationResult<string, void>
  getDeliveries: (webhookId: string) => Promise<WebhookDelivery[]>
} {
  const client = useClient()
  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchWebhooks = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await client.getWebhooks()
      setWebhooks(res.data)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setIsLoading(false)
    }
  }, [client])

  useEffect(() => {
    fetchWebhooks()
  }, [fetchWebhooks])

  // ── createWebhook mutation ──
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<Error | null>(null)
  const createWebhook = {
    execute: useCallback(
      async (input: { url: string; events: string[]; description?: string }) => {
        setCreating(true)
        setCreateError(null)
        try {
          const result = await client.createWebhook(input.url, input.events, input.description)
          await fetchWebhooks()
          return result
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err))
          setCreateError(e)
          throw e
        } finally {
          setCreating(false)
        }
      },
      [client, fetchWebhooks],
    ),
    isLoading: creating,
    error: createError,
  } satisfies UseMutationResult<{ url: string; events: string[]; description?: string }, Webhook>

  // ── updateWebhook mutation ──
  const [updating, setUpdating] = useState(false)
  const [updateError, setUpdateError] = useState<Error | null>(null)
  const updateWebhook = {
    execute: useCallback(
      async (input: {
        id: string
        updates: Partial<{ url: string; events: string[]; description: string; is_active: boolean }>
      }) => {
        setUpdating(true)
        setUpdateError(null)
        try {
          const result = await client.updateWebhook(input.id, input.updates)
          await fetchWebhooks()
          return result
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err))
          setUpdateError(e)
          throw e
        } finally {
          setUpdating(false)
        }
      },
      [client, fetchWebhooks],
    ),
    isLoading: updating,
    error: updateError,
  } satisfies UseMutationResult<
    {
      id: string
      updates: Partial<{ url: string; events: string[]; description: string; is_active: boolean }>
    },
    Webhook
  >

  // ── deleteWebhook mutation ──
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<Error | null>(null)
  const deleteWebhook = {
    execute: useCallback(
      async (id: string) => {
        setDeleting(true)
        setDeleteError(null)
        try {
          await client.deleteWebhook(id)
          await fetchWebhooks()
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err))
          setDeleteError(e)
          throw e
        } finally {
          setDeleting(false)
        }
      },
      [client, fetchWebhooks],
    ),
    isLoading: deleting,
    error: deleteError,
  } satisfies UseMutationResult<string, void>

  const getDeliveries = useCallback(
    async (webhookId: string) => {
      const res = await client.getWebhookDeliveries(webhookId)
      return res.data
    },
    [client],
  )

  return {
    data: webhooks,
    webhooks,
    isLoading,
    error,
    refetch: fetchWebhooks,
    createWebhook,
    updateWebhook,
    deleteWebhook,
    getDeliveries,
  }
}
