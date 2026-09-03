/*
 * MIT License
 *
 * Copyright (c) 2026 TenantScale
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { setTenantScaleContext } from './request-context.js'
import { TenantScaleService } from './tenant-scale.service.js'

// Metadata keys
const AUTHENTICATE_API_KEY_METADATA = 'tenantScale:authenticateApiKey'
const REQUIRE_PLAN_LIMIT_METADATA = 'tenantScale:requirePlanLimit'
const REQUIRE_SCOPE_METADATA = 'tenantScale:requireScope'

@Injectable()
export class TenantScaleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantScaleService: TenantScaleService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler()
    const classRef = context.getClass()

    const requiresAuth =
      this.reflector.getAllAndOverride<boolean>(AUTHENTICATE_API_KEY_METADATA, [
        handler,
        classRef,
      ]) ?? false

    // Check scope requirements
    const requiredScopes = this.reflector.getAllAndOverride<string[]>(REQUIRE_SCOPE_METADATA, [
      handler,
      classRef,
    ])

    // Check plan limit requirements
    const planLimitConfig = this.reflector.getAllAndOverride<
      | { feature: string; currentCount?: number | ((req: unknown) => number | Promise<number>) }
      | string
    >(REQUIRE_PLAN_LIMIT_METADATA, [handler, classRef])

    // Determine if authentication is required based on all relevant metadata
    const authRequired =
      requiresAuth || (requiredScopes && requiredScopes.length > 0) || !!planLimitConfig

    if (!authRequired) {
      return true
    }

    const req = context.switchToHttp().getRequest()
    const options = this.tenantScaleService.moduleOptions
    const apiKeyHeader = options.apiKeyHeader ?? options.authHeader ?? 'x-api-key'

    const token = this.extractToken(req, apiKeyHeader)
    if (!token) {
      throw new UnauthorizedException('Authentication required')
    }

    const apiKeyInfo = await this.tenantScaleService.authenticateApiKey(token)

    // Set tenant context on request (Express and Fastify both support this)
    ;(req as Record<string, unknown>).tenantKey = apiKeyInfo
    ;(req as Record<string, unknown>).tenantId = apiKeyInfo.tenant_id

    // Set context in AsyncLocalStorage for async operations
    setTenantScaleContext({
      tenantId: apiKeyInfo.tenant_id,
      tenantKey: apiKeyInfo,
    })

    // Check scope requirements
    if (requiredScopes && requiredScopes.length > 0) {
      this.tenantScaleService.requireScope(apiKeyInfo, ...requiredScopes)
    }

    // Check plan limit requirements
    if (planLimitConfig) {
      const feature =
        typeof planLimitConfig === 'string' ? planLimitConfig : planLimitConfig.feature
      const currentCount =
        typeof planLimitConfig === 'string'
          ? 0
          : typeof planLimitConfig.currentCount === 'function'
            ? planLimitConfig.currentCount(req)
            : (planLimitConfig.currentCount ?? 0)

      await this.tenantScaleService.requirePlanLimit(
        apiKeyInfo.tenant_id,
        feature,
        typeof currentCount === 'number' ? currentCount : await currentCount,
      )
    }

    return true
  }

  private extractToken(req: Record<string, unknown>, headerName: string): string | undefined {
    const headers = req.headers as Record<string, string | string[] | undefined> | undefined
    if (!headers) return undefined

    // Try the configured header first
    const headerValue = this.getHeaderValue(headers, headerName)
    if (headerValue) {
      return headerValue.startsWith('Bearer ') ? headerValue.slice(7).trim() : headerValue
    }

    // Fallback to authorization header
    const authValue = this.getHeaderValue(headers, 'authorization')
    if (authValue) {
      return authValue.startsWith('Bearer ') ? authValue.slice(7).trim() : authValue
    }

    return undefined
  }

  private getHeaderValue(
    headers: Record<string, string | string[] | undefined>,
    name: string,
  ): string | undefined {
    const value = headers[name.toLowerCase()]
    if (value === undefined) return undefined
    if (Array.isArray(value)) return value[0]
    return value
  }
}
