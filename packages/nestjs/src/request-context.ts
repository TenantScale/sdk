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

import { AsyncLocalStorage } from 'node:async_hooks'
import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import type { TenantScaleRequestContext } from './types.js'

const storage = new AsyncLocalStorage<TenantScaleRequestContext>()

/**
 * Run a callback with tenant context in AsyncLocalStorage.
 * Useful for background jobs or async operations that need tenant context.
 *
 * @param context - The tenant context to store
 * @param callback - The callback to run with the context
 * @returns The result of the callback
 *
 * @example
 * runWithTenantScaleContext({ tenantId: 'tenant-123' }, async () => {
 *   // This code has access to tenant context via getTenantScaleContext()
 * })
 */
export function runWithTenantScaleContext<T>(
  context: TenantScaleRequestContext,
  callback: () => T,
): T {
  return storage.run(context, callback)
}

/**
 * Get the current tenant context from AsyncLocalStorage.
 * Returns undefined if no context is set.
 *
 * @example
 * const context = getTenantScaleContext()
 * if (context?.tenantId) {
 *   // Use tenantId
 * }
 */
export function getTenantScaleContext(): TenantScaleRequestContext | undefined {
  return storage.getStore()
}

/**
 * Set the tenant context in AsyncLocalStorage.
 * Called internally by the guard after successful authentication.
 *
 * @internal
 */
export function setTenantScaleContext(context: TenantScaleRequestContext): void {
  storage.enterWith(context)
}

/**
 * Custom parameter decorator to inject tenant context into controller methods.
 * Extracts context from the request object (set by TenantScaleGuard).
 *
 * @example
 * @Get('users')
 * getUsers(@TenantContext() tenant: TenantScaleRequestContext) {
 *   console.log(tenant.tenantId)
 * }
 */
export const TenantContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantScaleRequestContext | undefined => {
    const request = ctx.switchToHttp().getRequest()
    return {
      tenantId: request.tenantId as string | undefined,
      tenantKey: request.tenantKey,
    }
  },
)

/**
 * Custom parameter decorator to inject the tenant ID into controller methods.
 * Convenience decorator for when you only need the tenant ID.
 *
 * @example
 * @Get('users')
 * getUsers(@TenantId() tenantId: string) {
 *   console.log(tenantId)
 * }
 */
export const TenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest()
    return request.tenantId as string | undefined
  },
)
