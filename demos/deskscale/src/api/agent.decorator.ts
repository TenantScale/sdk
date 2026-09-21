import { createParamDecorator, ExecutionContext } from '@nestjs/common'

// @Agent() reads the resolved demo agent (name, role, tenant, branding) from
// the request that @AuthenticateApiKey populated. Lets controllers render
// tenant-specific branding and enforce role-level rules beyond scopes.
export const Agent = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest()
  return req.demoAgent ?? null
})
