// ════════════════════════════════════════════════════════
// TenantScale × NestJS — Mock tenant store
//
// This demo runs WITHOUT a real Supabase instance by supplying a
// minimal in-memory TenantScale via TenantScaleModule.forRoot({ tenantScale }).
//
// In a real app you'd instead pass `sdkOptions` (Supabase URL + keys) and let
// TenantScale authenticate API keys against your tenant table.
// ════════════════════════════════════════════════════════

import { AuthenticationError, AuthorizationError } from '@tenantscale/sdk'
import type { ApiKeyInfo } from '@tenantscale/sdk'

interface FakeTenant {
  tenant_id: string
  api_key: string
  scopes: string[]
}

// A couple of demo tenants, keyed by the API key they present.
const TENANTS: FakeTenant[] = [
  { tenant_id: 'tenant_acme', api_key: 'demo-acme-key', scopes: ['read:users', 'write:users'] },
  { tenant_id: 'tenant_globex', api_key: 'demo-globex-key', scopes: ['read:users'] },
]

/**
 * Minimal stand-in for the @tenantscale/sdk TenantScale client. Only the
 * methods the NestJS adapter actually calls are implemented.
 */
export class MockTenantScale {
  async validateApiKey(token: string): Promise<ApiKeyInfo> {
    const tenant = TENANTS.find((t) => t.api_key === token)
    if (!tenant) {
      throw new AuthenticationError('Invalid API key')
    }
    const apiKey = {
      tenant_id: tenant.tenant_id,
      scopes: tenant.scopes,
    }
    return apiKey as ApiKeyInfo
  }

  requireScope(apiKey: ApiKeyInfo, ...scopes: string[]): void {
    if (!apiKey) throw new AuthenticationError('API key not found')
    const tenant = TENANTS.find((t) => t.tenant_id === apiKey.tenant_id)
    const missing = scopes.filter((s) => !tenant?.scopes.includes(s))
    if (missing.length > 0) {
      throw new AuthorizationError(`Missing required scope(s): ${missing.join(', ')}`)
    }
  }

  plans: {
    getPlanLimit: (_feature: string) => Promise<number>
  } = {
    getPlanLimit: () => Promise.resolve(10),
  }

  async logAuditEvent(): Promise<void> {
    // no-op for the demo
  }
}
