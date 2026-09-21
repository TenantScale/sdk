import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common'
import { DEMO_STORE } from './tokens.js'
import { DemoStore } from './demo-store.js'

// Resolves the full demo agent (name/role/branding) into req.demoAgent so
// controllers can render tenant-specific UI and the request pulse can label it.
// Reads the API key header directly (like @AuthenticateApiKey) so it is
// independent of guard ordering.
@Injectable()
export class ResolveAgentGuard implements CanActivate {
  constructor(@Inject(DEMO_STORE) private store: DemoStore) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest()
    const token = req.headers['x-api-key'] as string | undefined
    if (!token) return true
    try {
      const apiKey = await this.store.validateApiKey(token)
      const agent = await this.store.resolveAgent(apiKey)
      req.demoAgent = agent
    } catch {
      // auth guard reports the 401; here we just leave agent unset
    }
    return true
  }
}
