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

import type { TenantScale, TenantScaleOptions, ApiKeyInfo } from '@tenantscale/sdk'
import type { Provider, InjectionToken } from '@nestjs/common'

// ── Module Options ──

export interface TenantScaleModuleOptions {
  /** TenantScale SDK instance (takes precedence over other options) */
  tenantScale?: TenantScale

  /** Factory function to create TenantScale instance (for async initialization) */
  tenantScaleFactory?: () => TenantScale | Promise<TenantScale>

  /** SDK options (used if tenantScale and tenantScaleFactory are not provided) */
  sdkOptions?: TenantScaleOptions

  /**
   * Header name for API key authentication.
   * @default 'x-api-key'
   */
  apiKeyHeader?: string

  /**
   * Header name for portal session authentication.
   * @default 'authorization'
   */
  authHeader?: string
}

export interface TenantScaleModuleAsyncOptions {
  /**
   * Whether the module is global (can be imported in any module without re-importing).
   * @default false
   */
  global?: boolean

  /**
   * Factory function to create module options asynchronously.
   * This is the standard NestJS pattern for async module configuration.
   */
  useFactory: (...args: unknown[]) => Promise<TenantScaleModuleOptions> | TenantScaleModuleOptions

  /**
   * Dependencies to inject into the useFactory function.
   */
  inject?: InjectionToken[]

  /**
   * Optional providers to register with the module.
   */
  providers?: Provider[]
}

// ── Request Context ──

export interface TenantScaleRequestContext {
  tenantId?: string
  tenantKey?: ApiKeyInfo
}

// ── Dependency Injection Tokens ──

export const TENANT_SCALE_TOKEN = Symbol('TENANT_SCALE_TOKEN')
export const TENANT_SCALE_OPTIONS_TOKEN = Symbol('TENANT_SCALE_OPTIONS_TOKEN')
export const TENANT_SCALE_CONTEXT_TOKEN = Symbol('TENANT_SCALE_CONTEXT_TOKEN')

// ── Re-export SDK types for convenience ──

export type { ApiKeyInfo }
