import {
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Body,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common'
import { eq, and, desc, asc } from 'drizzle-orm'
import {
  AuthenticateApiKey,
  AuditLog,
  RequirePlanLimit,
  RequireScope,
  TenantId,
} from '@tenantscale/nestjs'
import { Agent } from './agent.decorator.js'
import { ResolveAgentGuard } from './resolve-agent.guard.js'
import { DemoStore, type DemoAgent } from './demo-store.js'
import { DEMO_STORE } from './tokens.js'
import { PulseService } from './pulse.service.js'
import { db } from './db/index.js'
import { contacts, conversations, messages } from './db/schema.js'

// Main tenant-scoped resource. Every route is isolated by tenant_id,
// scope-guarded, plan-limited (on create), and audit-logged.
@Controller('api/conversations')
@AuthenticateApiKey()
@UseGuards(ResolveAgentGuard)
export class ConversationsController {
  constructor(
    @Inject(DEMO_STORE) private store: DemoStore,
    @Inject(PulseService) private pulse: PulseService,
  ) {}

  @Get()
  @RequireScope('read:conversations')
  @AuditLog({ action: 'conversations.list', resource: 'conversations' })
  async list(@TenantId() tenantId: string, @Agent() agent: DemoAgent) {
    const rows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.tenantId, tenantId!))
      .orderBy(desc(conversations.id))
    const out = await Promise.all(
      rows.map(async (c) => {
        const contact = await db
          .select()
          .from(contacts)
          .where(eq(contacts.id, c.contactId))
          .limit(1)
        return { ...c, contact: contact[0] }
      }),
    )
    this.pulse.push({
      tenant: tenantId!,
      method: 'GET',
      path: '/api/conversations',
      scope: 'read:conversations',
      rule: '@RequireScope',
      status: 200,
      msg: `listed ${out.length} conversations`,
    })
    return { tenantId, count: out.length, role: agent?.role, data: out }
  }

  @Get(':id')
  @RequireScope('read:conversations')
  async get(@TenantId() tenantId: string, @Param('id') id: string) {
    const conv = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, Number(id)), eq(conversations.tenantId, tenantId!)))
      .limit(1)
    if (conv.length === 0) {
      throw new HttpException('Conversation not found or not in your tenant', HttpStatus.NOT_FOUND)
    }
    const msgs = await db
      .select()
      .from(messages)
      .where(and(eq(messages.conversationId, conv[0].id), eq(messages.tenantId, tenantId!)))
      .orderBy(asc(messages.id))
    const contact = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, conv[0].contactId))
      .limit(1)
    this.pulse.push({
      tenant: tenantId!,
      method: 'GET',
      path: `/api/conversations/${id}`,
      scope: 'read:conversations',
      rule: '@RequireScope',
      status: 200,
      msg: 'fetched conversation',
    })
    return { ...conv[0], contact: contact[0], messages: msgs }
  }

  @Post()
  @RequireScope('manage:conversations')
  @RequirePlanLimit('conversations', async (req) => {
    const tenantId = (req as { tenantId?: string }).tenantId as string
    const rows = await db.select().from(conversations)
    return rows.filter((r) => r.tenantId === tenantId).length
  })
  @AuditLog({ action: 'conversations.create', resource: 'conversations' })
  async create(
    @TenantId() tenantId: string,
    @Body() body: { contactId: number; subject: string; message?: string },
  ) {
    const [conv] = await db
      .insert(conversations)
      .values({
        tenantId: tenantId!,
        contactId: body.contactId,
        subject: body.subject,
        status: 'open',
      })
      .returning()
    if (body.message) {
      await db.insert(messages).values({
        conversationId: conv.id,
        tenantId: tenantId!,
        author: 'contact',
        body: body.message,
        createdAt: new Date().toISOString(),
      })
    }
    this.pulse.push({
      tenant: tenantId!,
      method: 'POST',
      path: '/api/conversations',
      scope: 'manage:conversations',
      rule: '@RequireScope + @RequirePlanLimit',
      status: 201,
      msg: 'conversation created',
    })
    return { ...conv, statusCode: 201 }
  }

  @Post(':id/reply')
  @RequireScope('reply:conversations')
  async reply(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: { message: string },
  ) {
    const conv = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, Number(id)), eq(conversations.tenantId, tenantId!)))
      .limit(1)
    if (conv.length === 0) throw new HttpException('Not found in your tenant', HttpStatus.NOT_FOUND)
    const [m] = await db
      .insert(messages)
      .values({
        conversationId: conv[0].id,
        tenantId: tenantId!,
        author: 'agent',
        body: body.message,
        createdAt: new Date().toISOString(),
      })
      .returning()
    this.pulse.push({
      tenant: tenantId!,
      method: 'POST',
      path: `/api/conversations/${id}/reply`,
      scope: 'reply:conversations',
      rule: '@RequireScope',
      status: 201,
      msg: 'agent reply sent',
    })
    return m
  }

  @Post(':id/resolve')
  @RequireScope('manage:conversations')
  async resolve(@TenantId() tenantId: string, @Param('id') id: string) {
    await db
      .update(conversations)
      .set({ status: 'resolved' })
      .where(and(eq(conversations.id, Number(id)), eq(conversations.tenantId, tenantId!)))
    this.pulse.push({
      tenant: tenantId!,
      method: 'POST',
      path: `/api/conversations/${id}/resolve`,
      scope: 'manage:conversations',
      rule: '@RequireScope',
      status: 200,
      msg: 'conversation resolved',
    })
    return { ok: true }
  }
}
