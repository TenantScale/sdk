// ──────────────────────────────────────────────────────
// @tenantscale/react — useTeam hook
// ──────────────────────────────────────────────────────

import { useState, useCallback, useEffect } from 'react'
import { useClient } from '../context.js'
import type { UseQueryResult, UseMutationResult, TeamMember } from '../types.js'

export function useTeam(): UseQueryResult<TeamMember[]> & {
  members: TeamMember[]
  inviteMember: UseMutationResult<{ email: string; role: string }, void>
  removeMember: UseMutationResult<string, void>
  changeRole: UseMutationResult<{ id: string; role: string }, void>
} {
  const client = useClient()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchTeam = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await client.getTeam()
      setMembers(res.data)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setIsLoading(false)
    }
  }, [client])

  useEffect(() => {
    fetchTeam()
  }, [fetchTeam])

  // ── inviteMember mutation ──
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<Error | null>(null)
  const inviteMember = {
    execute: useCallback(
      async (input: { email: string; role: string }) => {
        setInviting(true)
        setInviteError(null)
        try {
          await client.inviteMember(input.email, input.role)
          await fetchTeam()
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err))
          setInviteError(e)
          throw e
        } finally {
          setInviting(false)
        }
      },
      [client, fetchTeam],
    ),
    isLoading: inviting,
    error: inviteError,
  } satisfies UseMutationResult<{ email: string; role: string }, void>

  // ── removeMember mutation ──
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<Error | null>(null)
  const removeMember = {
    execute: useCallback(
      async (id: string) => {
        setRemoving(true)
        setRemoveError(null)
        try {
          await client.removeMember(id)
          await fetchTeam()
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err))
          setRemoveError(e)
          throw e
        } finally {
          setRemoving(false)
        }
      },
      [client, fetchTeam],
    ),
    isLoading: removing,
    error: removeError,
  } satisfies UseMutationResult<string, void>

  // ── changeRole mutation ──
  const [changing, setChanging] = useState(false)
  const [changeError, setChangeError] = useState<Error | null>(null)
  const changeRole = {
    execute: useCallback(
      async (input: { id: string; role: string }) => {
        setChanging(true)
        setChangeError(null)
        try {
          await client.changeMemberRole(input.id, input.role)
          await fetchTeam()
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err))
          setChangeError(e)
          throw e
        } finally {
          setChanging(false)
        }
      },
      [client, fetchTeam],
    ),
    isLoading: changing,
    error: changeError,
  } satisfies UseMutationResult<{ id: string; role: string }, void>

  return {
    data: members,
    members,
    isLoading,
    error,
    refetch: fetchTeam,
    inviteMember,
    removeMember,
    changeRole,
  }
}
