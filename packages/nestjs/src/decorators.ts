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

import { SetMetadata, applyDecorators, UseGuards } from '@nestjs/common'
import { TenantScaleGuard } from './tenant-scale.guard.js'

// Metadata keys (must match those in guard and interceptor)
const AUTHENTICATE_API_KEY_METADATA = 'tenantScale:authenticateApiKey'
const REQUIRE_PLAN_LIMIT_METADATA = 'tenantScale:requirePlanLimit'
const REQUIRE_SCOPE_METADATA = 'tenantScale:requireScope'
const AUDIT_LOG_METADATA = 'tenantScale:auditLog'

/**
 * Decorator to mark a route or controller as requiring API key authentication.
 * Automatically applies TenantScaleGuard.
 *
 * @example
 * @AuthenticateApiKey()
 * @Get('protected')
 * protectedRoute() { ... }
 */
export const AuthenticateApiKey = () =>
  applyDecorators(SetMetadata(AUTHENTICATE_API_KEY_METADATA, true), UseGuards(TenantScaleGuard))

/**
 * Decorator to require specific plan limits for a route.
 * Automatically applies TenantScaleGuard.
 *
 * @param feature - The plan feature to check (e.g., 'pro', 'enterprise')
 * @param currentCount - Current count for the plan limit. Can be a number or a function that receives the request.
 *
 * @example
 * @RequirePlanLimit('pro')
 * @Get('premium')
 * premiumRoute() { ... }
 *
 * @example
 * @RequirePlanLimit('pro', (req) => req.body.items.length)
 * @Post('items')
 * createItems() { ... }
 */
export const RequirePlanLimit = (
  feature: string,
  currentCount?: number | ((req: unknown) => number | Promise<number>),
) =>
  applyDecorators(
    SetMetadata(REQUIRE_PLAN_LIMIT_METADATA, { feature, currentCount }),
    UseGuards(TenantScaleGuard),
  )

/**
 * Decorator to require specific API key scopes for a route.
 * Automatically applies TenantScaleGuard.
 *
 * @param scopes - Array of required scopes
 *
 * @example
 * @RequireScope('read:users', 'write:users')
 * @Get('users')
 * getUsers() { ... }
 */
export const RequireScope = (...scopes: string[]) =>
  applyDecorators(SetMetadata(REQUIRE_SCOPE_METADATA, scopes), UseGuards(TenantScaleGuard))

/**
 * Decorator to enable audit logging for a route.
 * Works with TenantScaleInterceptor to log successful requests.
 *
 * @param options - Audit log configuration
 *
 * @example
 * @AuditLog({ action: 'User Created', resource: 'users' })
 * @Post('users')
 * createUser() { ... }
 */
export const AuditLog = (options: {
  action: string
  resource?: string
  details?: Record<string, unknown>
}) => SetMetadata(AUDIT_LOG_METADATA, options)
