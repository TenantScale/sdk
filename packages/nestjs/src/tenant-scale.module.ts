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

import { DynamicModule, Module, Provider } from '@nestjs/common'
import { TenantScale } from '@tenantscale/sdk'
import { TenantScaleGuard } from './tenant-scale.guard.js'
import { TenantScaleInterceptor } from './tenant-scale.interceptor.js'
import { TenantScaleService } from './tenant-scale.service.js'
import {
  TENANT_SCALE_OPTIONS_TOKEN,
  TENANT_SCALE_TOKEN,
  type TenantScaleModuleOptions,
  type TenantScaleModuleAsyncOptions,
} from './types.js'

@Module({})
export class TenantScaleModule {
  static forRoot(options: TenantScaleModuleOptions): DynamicModule {
    const tenantScaleProvider: Provider = {
      provide: TENANT_SCALE_TOKEN,
      useFactory: async () => {
        if (options.tenantScale) {
          return options.tenantScale
        }
        if (options.tenantScaleFactory) {
          const instance = await options.tenantScaleFactory()
          if (!(instance instanceof TenantScale)) {
            throw new Error(
              'TenantScaleModule: tenantScaleFactory must return a TenantScale instance',
            )
          }
          return instance
        }
        if (options.sdkOptions) {
          return new TenantScale(options.sdkOptions)
        }
        throw new Error(
          'TenantScaleModule: Either tenantScale, tenantScaleFactory, or sdkOptions must be provided',
        )
      },
    }

    const optionsProvider: Provider = {
      provide: TENANT_SCALE_OPTIONS_TOKEN,
      useValue: options,
    }

    return {
      module: TenantScaleModule,
      providers: [
        tenantScaleProvider,
        optionsProvider,
        TenantScaleService,
        TenantScaleGuard,
        TenantScaleInterceptor,
      ],
      exports: [
        TenantScaleService,
        TENANT_SCALE_TOKEN,
        TENANT_SCALE_OPTIONS_TOKEN,
        TenantScaleGuard,
        TenantScaleInterceptor,
      ],
    }
  }

  static forRootAsync(asyncOptions: TenantScaleModuleAsyncOptions): DynamicModule {
    const tenantScaleProvider: Provider = {
      provide: TENANT_SCALE_TOKEN,
      useFactory: async (options: TenantScaleModuleOptions) => {
        if (options.tenantScale) {
          return options.tenantScale
        }
        if (options.tenantScaleFactory) {
          const instance = await options.tenantScaleFactory()
          if (!(instance instanceof TenantScale)) {
            throw new Error(
              'TenantScaleModule: tenantScaleFactory must return a TenantScale instance',
            )
          }
          return instance
        }
        if (options.sdkOptions) {
          return new TenantScale(options.sdkOptions)
        }
        throw new Error(
          'TenantScaleModule: Either tenantScale, tenantScaleFactory, or sdkOptions must be provided',
        )
      },
      inject: [TENANT_SCALE_OPTIONS_TOKEN],
    }

    const optionsProvider: Provider = {
      provide: TENANT_SCALE_OPTIONS_TOKEN,
      useFactory: async (...args: unknown[]) => {
        return await asyncOptions.useFactory(...args)
      },
      inject: asyncOptions.inject || [],
    }

    return {
      module: TenantScaleModule,
      global: asyncOptions.global || false,
      providers: [
        tenantScaleProvider,
        optionsProvider,
        ...(asyncOptions.providers || []),
        TenantScaleService,
        TenantScaleGuard,
        TenantScaleInterceptor,
      ],
      exports: [
        TenantScaleService,
        TENANT_SCALE_TOKEN,
        TENANT_SCALE_OPTIONS_TOKEN,
        TenantScaleGuard,
        TenantScaleInterceptor,
      ],
    }
  }
}
