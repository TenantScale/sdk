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

import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Observable } from 'rxjs'
import { tap, catchError } from 'rxjs/operators'
import { TenantScaleService } from './tenant-scale.service.js'

// Metadata key
const AUDIT_LOG_METADATA = 'tenantScale:auditLog'

interface AuditLogConfig {
  action: string
  resource?: string
  details?: Record<string, unknown>
}

@Injectable()
export class TenantScaleInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TenantScaleInterceptor.name)

  constructor(
    private readonly reflector: Reflector,
    private readonly tenantScaleService: TenantScaleService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const handler = context.getHandler()
    const classRef = context.getClass()

    const auditConfig = this.reflector.getAllAndOverride<AuditLogConfig>(AUDIT_LOG_METADATA, [
      handler,
      classRef,
    ])

    if (!auditConfig) {
      return next.handle()
    }

    const req = context.switchToHttp().getRequest()
    const tenantId = req.tenantId as string | undefined

    return next.handle().pipe(
      tap(async () => {
        if (tenantId) {
          try {
            await this.tenantScaleService.auditLog(
              tenantId,
              auditConfig.action,
              auditConfig.resource ?? 'request',
              auditConfig.details,
            )
          } catch (error) {
            // Log audit failures but don't fail the request
            this.logger.warn(
              `Failed to log audit event: ${error instanceof Error ? error.message : String(error)}`,
            )
          }
        }
      }),
      catchError((error) => {
        // Optionally log errors here
        throw error
      }),
    )
  }
}
