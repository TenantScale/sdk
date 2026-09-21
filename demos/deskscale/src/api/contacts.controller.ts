import { Controller, Get, Inject, UseGuards } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { AuthenticateApiKey, RequireScope, TenantId } from '@tenantscale/nestjs'
import { ResolveAgentGuard } from './resolve-agent.guard.js'
import { DemoStore } from './demo-store.js'
import { DEMO_STORE } from './tokens.js'
import { PulseService } from './pulse.service.js'
import { db } from './db/index.js'
import { contacts } from './db/schema.js'

// Contacts: tenant-scoped CRM surface.
@Controller('api/contacts')
@AuthenticateApiKey()
@UseGuards(ResolveAgentGuard)
export class ContactsController {
  constructor(
    @Inject(DEMO_STORE) private store: DemoStore,
    @Inject(PulseService) private pulse: PulseService,
  ) {}

  @Get()
  @RequireScope('read:conversations')
  async list(@TenantId() tenantId: string) {
    const rows = await db.select().from(contacts).where(eq(contacts.tenantId, tenantId!))
    this.pulse.push({
      tenant: tenantId!,
      method: 'GET',
      path: '/api/contacts',
      scope: 'read:conversations',
      rule: '@RequireScope',
      status: 200,
      msg: `listed ${rows.length} contacts`,
    })
    return { tenantId, count: rows.length, data: rows }
  }
}
