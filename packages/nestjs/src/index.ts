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

// Module
export { TenantScaleModule } from './tenant-scale.module.js'

// Service
export { TenantScaleService } from './tenant-scale.service.js'

// Guards & Interceptors
export { TenantScaleGuard } from './tenant-scale.guard.js'
export { TenantScaleInterceptor } from './tenant-scale.interceptor.js'

// Decorators
export { AuthenticateApiKey, RequirePlanLimit, RequireScope, AuditLog } from './decorators.js'

// Parameter Decorators & Context
export {
  TenantContext,
  TenantId,
  runWithTenantScaleContext,
  getTenantScaleContext,
  setTenantScaleContext,
} from './request-context.js'

// Types
export {
  type TenantScaleModuleOptions,
  type TenantScaleModuleAsyncOptions,
  type TenantScaleRequestContext,
  TENANT_SCALE_TOKEN,
  TENANT_SCALE_OPTIONS_TOKEN,
  TENANT_SCALE_CONTEXT_TOKEN,
} from './types.js'
