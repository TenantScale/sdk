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
