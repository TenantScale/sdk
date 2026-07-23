// ──────────────────────────────────────────────────────
// @tenantscale/react — useApiKeys hook
// ──────────────────────────────────────────────────────

import { useState, useCallback, useEffect } from 'react'
import { useClient } from '../context.js'
import type { UseQueryResult, UseMutationResult, ApiKey, CreatedApiKey } from '../types.js'

export function useApiKeys(): UseQueryResult<ApiKey[]> & {
  keys: ApiKey[]
  createKey: UseMutationResult<{ label: string; scopes?: string[] }, CreatedApiKey>
  revokeKey: UseMutationResult<string, void>
} {
  const client = useClient()
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchKeys = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await client.getApiKeys()
      setKeys(res.data)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setIsLoading(false)
    }
  }, [client])

  useEffect(() => {
    fetchKeys()
  }, [fetchKeys])

  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<Error | null>(null)
  const [revoking, setRevoking] = useState(false)
  const [revokeError, setRevokeError] = useState<Error | null>(null)

  const createKey: UseMutationResult<{ label: string; scopes?: string[] }, CreatedApiKey> = {
    execute: useCallback(
      async (input) => {
        setCreating(true)
        setCreateError(null)
        try {
          const result = await client.createApiKey(input.label, input.scopes)
          await fetchKeys()
          return result
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err))
          setCreateError(e)
          throw e
        } finally {
          setCreating(false)
        }
      },
      [client, fetchKeys],
    ),
    isLoading: creating,
    error: createError,
  }

  const revokeKey: UseMutationResult<string, void> = {
    execute: useCallback(
      async (id) => {
        setRevoking(true)
        setRevokeError(null)
        try {
          await client.revokeApiKey(id)
          await fetchKeys()
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err))
          setRevokeError(e)
          throw e
        } finally {
          setRevoking(false)
        }
      },
      [client, fetchKeys],
    ),
    isLoading: revoking,
    error: revokeError,
  }

  return { data: keys, keys, isLoading, error, refetch: fetchKeys, createKey, revokeKey }
}
