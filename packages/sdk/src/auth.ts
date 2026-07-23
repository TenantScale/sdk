// ──────────────────────────────────────────────────────
// Auth — API key validation and token handling
// Framework-agnostic: returns values, doesn't touch request/response
// ──────────────────────────────────────────────────────

import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApiKeyInfo } from './types.js'
import { AuthenticationError, AuthorizationError } from './types.js'

/**
 * Validate a raw API key token against the database.
 * Resolves the tenant, checks active status, and returns key info.
 *
 * @param supabase - Supabase admin client
 * @param token - Raw API key string (Bearer token value, without 'Bearer ' prefix)
 * @returns Resolved API key info with tenant_id, scopes, etc.
 * @throws AuthenticationError if the key is invalid, expired, or the tenant is inactive
 */
export async function validateApiKey(supabase: SupabaseClient, token: string): Promise<ApiKeyInfo> {
  if (!token) {
    throw new AuthenticationError('Empty API key')
  }

  const keyHash = createHash('sha256').update(token).digest('hex')

  const { data: keyRecord, error } = await supabase
    .from('api_keys')
    .select('*, tenant:tenants!inner(id, is_active)')
    .eq('key_hash', keyHash)
    .single()

  if (error || !keyRecord) {
    throw new AuthenticationError('Invalid API key')
  }

  if (!keyRecord.is_active) {
    throw new AuthorizationError('API key is deactivated', 'KEY_DEACTIVATED')
  }

  // Check if the API key has expired
  if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
    throw new AuthenticationError('API key has expired', 'KEY_EXPIRED')
  }

  const tenantRecord = keyRecord.tenant as unknown as { id: string; is_active: boolean }
  if (!tenantRecord.is_active) {
    throw new AuthorizationError('Tenant account is inactive', 'TENANT_INACTIVE')
  }

  // Fire-and-forget: update last_used_at.
  // This is intentionally silent on failure because:
  // - The auth check has already succeeded — this is purely tracking/metrics
  // - A failed update here should never block the API request
  // - No logger is available at this layer (framework-agnostic pure logic)
  void supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyRecord.id)
    .then(undefined, () => {
      /* intentionally ignored — see comment above */
    })

  return {
    raw: token,
    tenant_id: keyRecord.tenant_id,
    scopes: keyRecord.scopes,
    created_by: keyRecord.created_by,
    key_record_id: keyRecord.id,
  }
}

/**
 * Check if a set of scopes satisfies the required scopes.
 * The key's scopes must include at least one of the required scopes.
 */
export function hasRequiredScope(apiKey: ApiKeyInfo, ...requiredScopes: string[]): boolean {
  return requiredScopes.some((s) => apiKey.scopes.includes(s))
}

/**
 * Assert that a key has at least one of the required scopes.
 * Throws AuthorizationError if not.
 */
export function requireScope(apiKey: ApiKeyInfo, ...scopes: string[]): void {
  if (!hasRequiredScope(apiKey, ...scopes)) {
    throw new AuthorizationError(
      `This endpoint requires one of these scopes: ${scopes.join(', ')}`,
      'MISSING_SCOPE',
    )
  }
}
