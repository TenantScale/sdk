import { BadRequestException, Body, Controller, Get, Post, UseInterceptors } from '@nestjs/common'
import {
  AuthenticateApiKey,
  AuditLog,
  RequirePlanLimit,
  RequireScope,
  TenantId,
  TenantScaleInterceptor,
} from '@tenantscale/nestjs'

// ── In-memory per-tenant data store ─────────────────────────────
// Each tenant only ever sees rows owned by their own tenant_id.
interface Widget {
  id: number
  tenant_id: string
  name: string
}
let nextId = 1
const widgets: Widget[] = []

@Controller('widgets')
@AuthenticateApiKey()
@UseInterceptors(TenantScaleInterceptor)
export class WidgetsController {
  @Get()
  @RequireScope('read:users')
  @AuditLog({ action: 'widgets.list', resource: 'widgets' })
  list(@TenantId() tenantId: string) {
    // Query Guard in the SDK prevents cross-tenant leaks; here the filter
    // is explicit so the point is obvious.
    return { tenantId, data: widgets.filter((w) => w.tenant_id === tenantId) }
  }

  @Post()
  @RequireScope('write:users')
  @RequirePlanLimit('widgets', () => widgets.filter((w) => w.tenant_id === 'tenant_acme').length)
  @AuditLog({ action: 'widgets.create', resource: 'widgets' })
  create(@TenantId() tenantId: string, @Body() body: { name: string }) {
    if (!body.name) throw new BadRequestException('name is required')
    const widget: Widget = { id: nextId++, tenant_id: tenantId, name: body.name }
    widgets.push(widget)
    return widget
  }
}
