import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { AuthenticateApiKey, RequireScope, TenantId } from '@tenantscale/nestjs'
import { ResolveAgentGuard } from './resolve-agent.guard.js'
import { DemoStore } from './demo-store.js'
import { DEMO_STORE } from './tokens.js'
import { PulseService } from './pulse.service.js'
import { db } from './db/index.js'
import { conversations } from './db/schema.js'

// Superadmin desk: requires the global `admin:*` scope that only TenantScale's
// super-admin surface carries. Regular tenant keys are explicitly DENIED here
// (they lack the scope) - the isolation is visible right in the response.
@Controller('api/admin')
@AuthenticateApiKey()
@UseGuards(ResolveAgentGuard)
export class AdminController {
  constructor(
    @Inject(DEMO_STORE) private store: DemoStore,
    @Inject(PulseService) private pulse: PulseService,
  ) {}

  /** Cross-tenant view - ONLY super-admin keys may pass. */
  @Get('tenants')
  @RequireScope('admin:view')
  async tenants() {
    const data = await this.store.listTenantSummaries()
    this.pulse.push({
      tenant: 'superadmin',
      method: 'GET',
      path: '/api/admin/tenants',
      scope: 'admin:view',
      rule: '@RequireScope',
      status: 200,
      msg: 'cross-tenant desk rendered',
    })
    return { data }
  }

  /**
   * Deliberate isolation proof: agent tries to fetch a conversation that belongs
   * to a DIFFERENT tenant. The query is scoped by the caller's own @TenantId(),
   * so the cross-tenant row is unreachable - returns empty, never leaked data.
   */
  @Get('probe/:conversationId')
  @RequireScope('read:conversations')
  async probe(@TenantId() tenantId: string, @Param('conversationId') conversationId: string) {
    const row = await db
      .select()
      .from(conversations)
      .where(
        and(eq(conversations.id, Number(conversationId)), eq(conversations.tenantId, tenantId!)),
      )
      .limit(1)
    const verdict = row.length ? 'READ ALLOWED (own tenant)' : 'ISOLATED (not in caller tenant)'
    this.pulse.push({
      tenant: tenantId!,
      method: 'GET',
      path: `/api/admin/probe/${conversationId}`,
      scope: 'read:conversations',
      rule: '@TenantId + scoped query',
      status: 200,
      msg: verdict,
    })
    return { requestedId: conversationId, verdict, data: row }
  }
}
