import { eq, sql } from 'drizzle-orm'
import { AuthenticationError, AuthorizationError } from '@tenantscale/sdk'
import type { ApiKeyInfo, AuditEventInput } from '@tenantscale/sdk'
import { db } from './db/index.js'
import { agents, conversations, tenants } from './db/schema.js'

// ── DemoStore: a SQLite-backed TenantScale ───────────────────────
// This is what makes the demo fully self-contained: it implements the
// @tenantscale/sdk surface the NestJS adapter relies on, reading tenants,
// agents, and plan limits straight from the local database. No Supabase
// needed. Swap in a real TenantScale (sdkOptions) for production.

export interface DemoAgent extends ApiKeyInfo {
  name: string
  role: string
  scopeList: string[]
}

export class DemoStore {
  /** Resolve an API key to a tenant + scopes -> used by @AuthenticateApiKey */
  async validateApiKey(token: string): Promise<ApiKeyInfo> {
    // Platform super-admin key -> cross-tenant desk access.
    if (token === 'superadmin-key') {
      return { tenant_id: 'tenant_acme', scopes: ['admin:view', 'admin:manage'] } as ApiKeyInfo
    }
    const agent = await db.select().from(agents).where(eq(agents.apiKey, token)).limit(1)
    if (agent.length === 0) {
      throw new AuthenticationError('Invalid API key')
    }
    const t = agent[0]
    return {
      tenant_id: t.tenantId,
      scopes: t.scopes.split(',').map((s) => s.trim()),
    } as ApiKeyInfo
  }

  /** Enforce scopes -> used by @RequireScope */
  requireScope(apiKey: ApiKeyInfo, ...scopes: string[]): void {
    if (!apiKey) throw new AuthenticationError('API key not found')
    const missing = scopes.filter((s) => !apiKey.scopes?.includes(s))
    if (missing.length > 0) {
      throw new AuthorizationError(`Missing required scope(s): ${missing.join(', ')}`)
    }
  }

  /** Backing store for @RequirePlanLimit via requirePlanLimitCore(ts, ...) */
  plans = {
    getPlanLimit: async (tenantId: string, _feature: string): Promise<number | null> => {
      const rows = await db
        .select({ max: tenants.maxConversations })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1)
      return rows.length ? rows[0].max : null
    },
  }

  /** Record an audit event -> used by @AuditLog + the interceptor */
  async logAuditEvent(_input: AuditEventInput): Promise<void> {
    // Persisted audit is out of scope for the demo's in-memory pulse;
    // the live request pulse reads it from the service layer instead.
    return
  }

  /** Superadmin cross-tenant view (admin desk) */
  async listTenantSummaries(): Promise<
    Array<{ id: string; name: string; brandColor: string; plan: string; conversations: number }>
  > {
    const summary = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        brandColor: tenants.brandColor,
        plan: tenants.plan,
        conversations: sql<number>`count(${conversations.id})`,
      })
      .from(tenants)
      .leftJoin(conversations, eq(conversations.tenantId, tenants.id))
      .groupBy(tenants.id)
    return summary
  }

  async getTenantById(id: string) {
    const rows = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1)
    return rows[0] ?? null
  }

  async resolveAgent(apiKey: ApiKeyInfo): Promise<DemoAgent | null> {
    const rows = await db
      .select()
      .from(agents)
      .where(eq(agents.tenantId, apiKey.tenant_id))
      .limit(1)
    if (rows.length === 0) return null
    const a = rows[0]
    const t = (await this.getTenantById(a.tenantId))!
    return {
      tenant_id: a.tenantId,
      name: a.name,
      role: a.role,
      scopeList: a.scopes.split(',').map((s) => s.trim()),
      tenantName: t.name,
      tenantSlug: t.slug,
      brandColor: t.brandColor,
      plan: t.plan,
    } as unknown as DemoAgent
  }
}
