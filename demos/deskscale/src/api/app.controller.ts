import { Controller, Get, Inject, UseGuards } from '@nestjs/common'
import { AuthenticateApiKey, TenantId } from '@tenantscale/nestjs'
import { Agent } from './agent.decorator.js'
import { ResolveAgentGuard } from './resolve-agent.guard.js'
import { DemoStore, type DemoAgent } from './demo-store.js'
import { DEMO_STORE } from './tokens.js'
import { PulseService } from './pulse.service.js'

// No guard on this one - it represents the anonymous/public auth + session
// handshake the SPA uses. It is NOT tenant-scoped.
@Controller('api')
export class AppController {
  constructor(
    @Inject(DEMO_STORE) private store: DemoStore,
    @Inject(PulseService) private pulse: PulseService,
  ) {}

  /** List login options (tenant name + key) so the UI can offer a quick-switch. */
  @Get('login-options')
  async loginOptions() {
    return this.store.listTenantSummaries()
  }

  /** Current session: tenant identity + branding + role. Guarded + scoped. */
  @Get('me')
  @AuthenticateApiKey()
  @UseGuards(ResolveAgentGuard)
  async me(@TenantId() tenantId: string, @Agent() agent: DemoAgent) {
    const tenant = await this.store.getTenantById(tenantId)
    const agentOut = agent ? { name: agent.name, role: agent.role, scopes: agent.scopeList } : null
    this.pulse.push({
      tenant: tenantId,
      method: 'GET',
      path: '/api/me',
      scope: 'auth',
      rule: '@AuthenticateApiKey',
      status: 200,
      msg: 'session resolved',
    })
    return { tenant, agent: agentOut }
  }

  /** Live request pulse - every recent guard verdict, for the "secret sauce" pane. */
  @Get('pulse')
  pulseFeed() {
    return this.pulse.recent()
  }
}
