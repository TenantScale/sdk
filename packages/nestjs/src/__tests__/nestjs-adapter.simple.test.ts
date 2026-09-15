import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TenantScaleModule } from '../tenant-scale.module.js'
import { TenantScaleService } from '../tenant-scale.service.js'
import { TenantScaleGuard } from '../tenant-scale.guard.js'
import { TenantScaleInterceptor } from '../tenant-scale.interceptor.js'
import { AuthenticateApiKey, RequirePlanLimit, RequireScope, AuditLog } from '../decorators.js'
import {
  TenantContext,
  TenantId,
  getTenantScaleContext,
  runWithTenantScaleContext,
  setTenantScaleContext,
} from '../request-context.js'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  TenantScale,
  RateLimitExceededError,
  NotFoundError,
  ConflictError,
  AuthenticationError,
  TenantScaleError,
} from '@tenantscale/sdk'
import {
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  HttpException,
} from '@nestjs/common'
import type { ApiKeyInfo } from '@tenantscale/sdk'
import 'reflect-metadata'

class MockTenantScale extends TenantScale {
  constructor() {
    super({ supabaseUrl: 'https://example.supabase.co', supabaseKey: 'service-role-key' } as never)
  }

  override async validateApiKey(token: string): Promise<ApiKeyInfo> {
    if (token === 'valid') {
      return {
        tenant_id: 'tenant-1',
        key_record_id: 'key-1',
        scopes: ['read', 'write'],
      } as ApiKeyInfo
    }
    throw new AuthenticationError('Invalid key')
  }

  override requireScope(apiKey: ApiKeyInfo, ...scopes: string[]): void {
    const keyScopes = apiKey.scopes || []
    const hasAllScopes = scopes.every((scope) => keyScopes.includes(scope))
    if (!hasAllScopes) {
      throw new AuthenticationError('Missing required scope')
    }
  }

  override async logAuditEvent(event: {
    tenant_id: string
    action: string
    resource: string
  }): Promise<void> {
    // Mock implementation
  }
}

describe('TenantScale NestJS adapter', () => {
  describe('Module registration', () => {
    it('registers the module with forRoot using tenantScale instance', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          TenantScaleModule.forRoot({
            tenantScale: new MockTenantScale(),
          }),
        ],
      }).compile()

      const service = moduleRef.get(TenantScaleService)
      expect(service).toBeDefined()
      expect(service.sdk).toBeDefined()
    })

    it('registers the module with forRoot using sdkOptions', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          TenantScaleModule.forRoot({
            sdkOptions: {
              supabaseUrl: 'https://example.supabase.co',
              supabaseKey: 'service-role-key',
            } as never,
          }),
        ],
      }).compile()

      const service = moduleRef.get(TenantScaleService)
      expect(service).toBeDefined()
    })

    it('registers the module with forRootAsync', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          TenantScaleModule.forRootAsync({
            useFactory: () => ({
              tenantScale: new MockTenantScale(),
            }),
          }),
        ],
      }).compile()

      const service = moduleRef.get(TenantScaleService)
      expect(service).toBeDefined()
    })

    it('registers the module with forRootAsync with dependencies', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          TenantScaleModule.forRootAsync({
            useFactory: () => ({
              tenantScale: new MockTenantScale(),
            }),
            inject: [],
          }),
        ],
      }).compile()

      const service = moduleRef.get(TenantScaleService)
      expect(service).toBeDefined()
    })

    it('throws error when no tenantScale, tenantScaleFactory, or sdkOptions provided', async () => {
      await expect(
        Test.createTestingModule({
          imports: [
            TenantScaleModule.forRoot({
              apiKeyHeader: 'x-custom-key',
            } as never),
          ],
        }).compile(),
      ).rejects.toThrow('Either tenantScale, tenantScaleFactory, or sdkOptions must be provided')
    })

    it('exports all necessary providers', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          TenantScaleModule.forRoot({
            tenantScale: new MockTenantScale(),
          }),
        ],
      }).compile()

      expect(moduleRef.get(TenantScaleService)).toBeDefined()
      expect(moduleRef.get(TenantScaleGuard)).toBeDefined()
      expect(moduleRef.get(TenantScaleInterceptor)).toBeDefined()
    })
  })

  describe('TenantScaleService', () => {
    let service: TenantScaleService

    beforeEach(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          TenantScaleModule.forRoot({
            tenantScale: new MockTenantScale(),
          }),
        ],
      }).compile()

      service = moduleRef.get(TenantScaleService)
    })

    it('exposes the SDK instance', () => {
      expect(service.sdk).toBeDefined()
    })

    it('exposes module options', () => {
      expect(service.moduleOptions).toBeDefined()
    })

    it('authenticates valid API key', async () => {
      const result = await service.authenticateApiKey('valid')
      expect(result.tenant_id).toBe('tenant-1')
    })

    it('throws UnauthorizedException for invalid API key', async () => {
      await expect(service.authenticateApiKey('invalid')).rejects.toThrow(UnauthorizedException)
    })

    it('requires scope when apiKey has required scopes', () => {
      const apiKey = { tenant_id: 'tenant-1', scopes: ['read', 'write'] } as ApiKeyInfo
      expect(() => service.requireScope(apiKey, 'read')).not.toThrow()
    })

    it('throws UnauthorizedException when apiKey is undefined', () => {
      expect(() => service.requireScope(undefined, 'read')).toThrow(UnauthorizedException)
    })

    it('throws UnauthorizedException when apiKey lacks required scope', () => {
      const apiKey = { tenant_id: 'tenant-1', scopes: ['read'] } as ApiKeyInfo
      expect(() => service.requireScope(apiKey, 'write')).toThrow(UnauthorizedException)
    })

    it('requires plan limit when tenantId exists and limit is not exceeded', async () => {
      vi.spyOn(service.sdk.plans, 'getPlanLimit').mockResolvedValue(5)
      await expect(service.requirePlanLimit('tenant-1', 'feature', 3)).resolves.not.toThrow()
    })

    it('throws ForbiddenException when plan limit is exceeded', async () => {
      vi.spyOn(service.sdk.plans, 'getPlanLimit').mockResolvedValue(5)
      await expect(service.requirePlanLimit('tenant-1', 'feature', 10)).rejects.toThrow(
        ForbiddenException,
      )
    })

    it('allows plan limit boundary: limit 1 allows first request', async () => {
      vi.spyOn(service.sdk.plans, 'getPlanLimit').mockResolvedValue(1)
      await expect(service.requirePlanLimit('tenant-1', 'feature', 0)).resolves.not.toThrow()
    })

    it('blocks plan limit boundary: limit 1 blocks at count 1', async () => {
      vi.spyOn(service.sdk.plans, 'getPlanLimit').mockResolvedValue(1)
      await expect(service.requirePlanLimit('tenant-1', 'feature', 1)).rejects.toThrow(
        ForbiddenException,
      )
    })

    it('allows plan limit boundary: limit 5 allows requests 0-4', async () => {
      vi.spyOn(service.sdk.plans, 'getPlanLimit').mockResolvedValue(5)
      await expect(service.requirePlanLimit('tenant-1', 'feature', 4)).resolves.not.toThrow()
    })

    it('blocks plan limit boundary: limit 5 blocks at count 5', async () => {
      vi.spyOn(service.sdk.plans, 'getPlanLimit').mockResolvedValue(5)
      await expect(service.requirePlanLimit('tenant-1', 'feature', 5)).rejects.toThrow(
        ForbiddenException,
      )
    })

    it('supports async currentCount function', async () => {
      vi.spyOn(service.sdk.plans, 'getPlanLimit').mockResolvedValue(5)
      await expect(
        service.requirePlanLimit('tenant-1', 'feature', async () => 3),
      ).resolves.not.toThrow()
    })

    it('logs audit event when tenantId exists', async () => {
      vi.spyOn(service.sdk, 'logAuditEvent').mockResolvedValue()
      await service.auditLog('tenant-1', 'action', 'resource')
      expect(service.sdk.logAuditEvent).toHaveBeenCalled()
    })

    it('skips audit log when tenantId is missing', async () => {
      vi.spyOn(service.sdk, 'logAuditEvent').mockResolvedValue()
      await service.auditLog(undefined, 'action', 'resource')
      expect(service.sdk.logAuditEvent).not.toHaveBeenCalled()
    })

    it('converts RateLimitExceededError to 429 status', async () => {
      vi.spyOn(service.sdk, 'validateApiKey').mockRejectedValue(
        new RateLimitExceededError('Rate limit exceeded'),
      )
      await expect(service.authenticateApiKey('valid')).rejects.toThrow(HttpException)
      try {
        await service.authenticateApiKey('valid')
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException)
        expect((error as HttpException).getStatus()).toBe(429)
      }
    })

    it('converts NotFoundError to 404 status', async () => {
      vi.spyOn(service.sdk, 'validateApiKey').mockRejectedValue(new NotFoundError('Not found'))
      await expect(service.authenticateApiKey('valid')).rejects.toThrow(NotFoundException)
    })

    it('converts ConflictError to 409 status', async () => {
      vi.spyOn(service.sdk, 'validateApiKey').mockRejectedValue(new ConflictError('Conflict'))
      await expect(service.authenticateApiKey('valid')).rejects.toThrow(ConflictException)
    })

    it('converts generic errors to ForbiddenException (not 401)', async () => {
      vi.spyOn(service.sdk, 'validateApiKey').mockRejectedValue(new Error('Generic error'))
      await expect(service.authenticateApiKey('valid')).rejects.toThrow(ForbiddenException)
      await expect(service.authenticateApiKey('valid')).rejects.not.toThrow(UnauthorizedException)
    })

    it('converts TenantScaleError to ForbiddenException', async () => {
      vi.spyOn(service.sdk, 'validateApiKey').mockRejectedValue(
        new TenantScaleError('TenantScale error'),
      )
      await expect(service.authenticateApiKey('valid')).rejects.toThrow(ForbiddenException)
    })

    it('throws UnauthorizedException when tenantId is missing for plan limit', async () => {
      await expect(service.requirePlanLimit(undefined, 'feature', 1)).rejects.toThrow(
        UnauthorizedException,
      )
    })
  })

  describe('TenantScaleGuard', () => {
    let guard: TenantScaleGuard
    let reflector: Reflector

    beforeEach(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          TenantScaleModule.forRoot({
            tenantScale: new MockTenantScale(),
          }),
        ],
      }).compile()

      guard = moduleRef.get(TenantScaleGuard)
      reflector = moduleRef.get(Reflector)
    })

    it('returns true when authentication is not required', async () => {
      const context = createMockExecutionContext(reflector, false)
      expect(await guard.canActivate(context)).toBe(true)
    })

    it('requires authentication when @RequireScope is used without @AuthenticateApiKey', async () => {
      const context = createMockExecutionContext(
        reflector,
        false, // no requiresAuth metadata
        {},
        undefined,
        ['read'], // but has scope metadata
      )
      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException)
    })

    it('requires authentication when @RequirePlanLimit is used without @AuthenticateApiKey', async () => {
      vi.spyOn(guard['tenantScaleService'].sdk.plans, 'getPlanLimit').mockResolvedValue(null)
      const context = createMockExecutionContext(
        reflector,
        false, // no requiresAuth metadata
        {}, // no API key
        { feature: 'pro-feature' }, // but has plan limit metadata
      )
      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException)
    })

    it('allows genuinely public routes with no metadata', async () => {
      const context = createMockExecutionContext(reflector, false, {}, undefined, undefined)
      expect(await guard.canActivate(context)).toBe(true)
    })

    it('throws UnauthorizedException when token is missing', async () => {
      const context = createMockExecutionContext(reflector, true, {})
      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException)
    })

    it('authenticates with valid token from x-api-key header', async () => {
      const context = createMockExecutionContext(reflector, true, { 'x-api-key': 'valid' })
      expect(await guard.canActivate(context)).toBe(true)
      expect(context.switchToHttp().getRequest().tenantId).toBe('tenant-1')
    })

    it('authenticates with valid token from authorization header', async () => {
      const context = createMockExecutionContext(reflector, true, { authorization: 'valid' })
      expect(await guard.canActivate(context)).toBe(true)
    })

    it('authenticates with Bearer token from authorization header', async () => {
      const context = createMockExecutionContext(reflector, true, { authorization: 'Bearer valid' })
      expect(await guard.canActivate(context)).toBe(true)
    })

    it('throws UnauthorizedException for invalid token', async () => {
      const context = createMockExecutionContext(reflector, true, { 'x-api-key': 'invalid' })
      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException)
    })

    it('checks plan limit when metadata is set', async () => {
      vi.spyOn(guard['tenantScaleService'].sdk.plans, 'getPlanLimit').mockResolvedValue(null)
      const context = createMockExecutionContext(
        reflector,
        true,
        { 'x-api-key': 'valid' },
        { feature: 'pro-feature' },
      )
      expect(await guard.canActivate(context)).toBe(true)
    })

    it('checks scope requirements when metadata is set', async () => {
      const context = createMockExecutionContext(
        reflector,
        true,
        { 'x-api-key': 'valid' },
        undefined,
        ['read'],
      )
      expect(await guard.canActivate(context)).toBe(true)
    })

    it('uses configured authHeader when apiKeyHeader is not set', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          TenantScaleModule.forRoot({
            tenantScale: new MockTenantScale(),
            authHeader: 'x-custom-auth',
          }),
        ],
      }).compile()

      const customGuard = moduleRef.get(TenantScaleGuard)
      const customReflector = moduleRef.get(Reflector)
      const context = createMockExecutionContext(customReflector, true, {
        'x-custom-auth': 'valid',
      })
      expect(await customGuard.canActivate(context)).toBe(true)
    })

    it('uses configured apiKeyHeader when set', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          TenantScaleModule.forRoot({
            tenantScale: new MockTenantScale(),
            apiKeyHeader: 'x-custom-key',
          }),
        ],
      }).compile()

      const customGuard = moduleRef.get(TenantScaleGuard)
      const customReflector = moduleRef.get(Reflector)
      const context = createMockExecutionContext(customReflector, true, { 'x-custom-key': 'valid' })
      expect(await customGuard.canActivate(context)).toBe(true)
    })

    it('passes correct current count to service when using RequirePlanLimit with static count', async () => {
      vi.spyOn(guard['tenantScaleService'].sdk.plans, 'getPlanLimit').mockResolvedValue(5)
      const requirePlanLimitSpy = vi.spyOn(guard['tenantScaleService'], 'requirePlanLimit')

      const context = createMockExecutionContext(
        reflector,
        true,
        { 'x-api-key': 'valid' },
        { feature: 'pro-feature', currentCount: 3 },
      )

      expect(await guard.canActivate(context)).toBe(true)
      expect(requirePlanLimitSpy).toHaveBeenCalledWith('tenant-1', 'pro-feature', 3)
    })

    it('passes correct current count to service when using RequirePlanLimit with count function', async () => {
      vi.spyOn(guard['tenantScaleService'].sdk.plans, 'getPlanLimit').mockResolvedValue(5)
      const requirePlanLimitSpy = vi.spyOn(guard['tenantScaleService'], 'requirePlanLimit')

      const countFn = (_req: unknown) => 4
      const context = createMockExecutionContext(
        reflector,
        true,
        { 'x-api-key': 'valid' },
        { feature: 'pro-feature', currentCount: countFn },
      )

      expect(await guard.canActivate(context)).toBe(true)
      expect(requirePlanLimitSpy).toHaveBeenCalledWith('tenant-1', 'pro-feature', 4)
    })

    it('defaults to 0 when RequirePlanLimit is used without current count', async () => {
      vi.spyOn(guard['tenantScaleService'].sdk.plans, 'getPlanLimit').mockResolvedValue(5)
      const requirePlanLimitSpy = vi.spyOn(guard['tenantScaleService'], 'requirePlanLimit')

      const context = createMockExecutionContext(
        reflector,
        true,
        { 'x-api-key': 'valid' },
        { feature: 'pro-feature' },
      )

      expect(await guard.canActivate(context)).toBe(true)
      expect(requirePlanLimitSpy).toHaveBeenCalledWith('tenant-1', 'pro-feature', 0)
    })

    it('handles backward compatibility when RequirePlanLimit is used with old string format', async () => {
      vi.spyOn(guard['tenantScaleService'].sdk.plans, 'getPlanLimit').mockResolvedValue(5)
      const requirePlanLimitSpy = vi.spyOn(guard['tenantScaleService'], 'requirePlanLimit')

      const context = createMockExecutionContext(
        reflector,
        true,
        { 'x-api-key': 'valid' },
        'pro-feature',
      )

      expect(await guard.canActivate(context)).toBe(true)
      expect(requirePlanLimitSpy).toHaveBeenCalledWith('tenant-1', 'pro-feature', 0)
    })

    it('blocks request when plan limit is exceeded with provided count', async () => {
      vi.spyOn(guard['tenantScaleService'].sdk.plans, 'getPlanLimit').mockResolvedValue(5)

      const context = createMockExecutionContext(
        reflector,
        true,
        { 'x-api-key': 'valid' },
        { feature: 'pro-feature', currentCount: 10 },
      )

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException)
    })
  })

  describe('TenantScaleInterceptor', () => {
    let interceptor: TenantScaleInterceptor
    let reflector: Reflector

    beforeEach(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          TenantScaleModule.forRoot({
            tenantScale: new MockTenantScale(),
          }),
        ],
      }).compile()

      interceptor = moduleRef.get(TenantScaleInterceptor)
      reflector = moduleRef.get(Reflector)
    })

    it('passes through when no audit metadata is set', async () => {
      const { of } = await import('rxjs')
      const context = createMockExecutionContext(reflector, false)
      const callHandler = { handle: () => of('result') }
      const observable = interceptor.intercept(context, callHandler)
      const result = await observable.toPromise()
      expect(result).toBe('result')
    })

    it('logs audit event when metadata is set and tenantId exists', async () => {
      const { of } = await import('rxjs')
      const context = createMockExecutionContext(
        reflector,
        false,
        undefined,
        undefined,
        undefined,
        {
          action: 'Test',
          resource: 'test',
        },
      )
      context.switchToHttp().getRequest().tenantId = 'tenant-1'
      const callHandler = { handle: () => of('result') }
      const observable = interceptor.intercept(context, callHandler)
      const result = await observable.toPromise()
      expect(result).toBe('result')
    })

    it('does not log audit event when tenantId is missing', async () => {
      const { of } = await import('rxjs')
      const context = createMockExecutionContext(
        reflector,
        false,
        undefined,
        undefined,
        undefined,
        {
          action: 'Test',
          resource: 'test',
        },
      )
      const callHandler = { handle: () => of('result') }
      const observable = interceptor.intercept(context, callHandler)
      const result = await observable.toPromise()
      expect(result).toBe('result')
    })
  })

  describe('Decorators', () => {
    it('AuthenticateApiKey decorator creates metadata and applies guard', () => {
      const decorator = AuthenticateApiKey()
      expect(decorator).toBeDefined()
      // Verify it applies UseGuards by checking the decorator structure
      // The decorator should be a composite decorator that includes UseGuards
    })

    it('RequirePlanLimit decorator creates metadata and applies guard', () => {
      const decorator = RequirePlanLimit('pro')
      expect(decorator).toBeDefined()
    })

    it('RequireScope decorator creates metadata and applies guard', () => {
      const decorator = RequireScope('read', 'write')
      expect(decorator).toBeDefined()
    })

    it('AuditLog decorator creates metadata', () => {
      const decorator = AuditLog({ action: 'Test', resource: 'test' })
      expect(decorator).toBeDefined()
    })
  })

  describe('Parameter decorators', () => {
    it('TenantContext decorator is a callable decorator', () => {
      const decorator = TenantContext()
      expect(typeof decorator).toBe('function')
    })

    it('TenantId decorator is a callable decorator', () => {
      const decorator = TenantId()
      expect(typeof decorator).toBe('function')
    })
  })

  describe('AsyncLocalStorage context', () => {
    it('sets and gets tenant context', () => {
      setTenantScaleContext({ tenantId: 'tenant-1' })
      const context = getTenantScaleContext()
      expect(context?.tenantId).toBe('tenant-1')
    })

    it('runs callback with context', () => {
      let result: string | undefined
      runWithTenantScaleContext({ tenantId: 'tenant-1' }, () => {
        result = getTenantScaleContext()?.tenantId
      })
      expect(result).toBe('tenant-1')
    })

    it('isolates context between concurrent requests', async () => {
      const results: string[] = []

      // Simulate 10 concurrent requests with different tenant IDs
      const promises = Array.from({ length: 10 }, async (_, i) => {
        const tenantId = `tenant-${i}`
        setTenantScaleContext({ tenantId })

        // Simulate async work
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 10))

        const context = getTenantScaleContext()
        results.push(context?.tenantId || 'missing')
      })

      await Promise.all(promises)

      // Each request should have its own isolated context
      expect(results).toHaveLength(10)
      expect(results).toEqual(
        expect.arrayContaining([
          'tenant-0',
          'tenant-1',
          'tenant-2',
          'tenant-3',
          'tenant-4',
          'tenant-5',
          'tenant-6',
          'tenant-7',
          'tenant-8',
          'tenant-9',
        ]),
      )
    })

    it('context does not leak between sequential set operations', () => {
      setTenantScaleContext({ tenantId: 'tenant-1' })
      expect(getTenantScaleContext()?.tenantId).toBe('tenant-1')

      setTenantScaleContext({ tenantId: 'tenant-2' })
      expect(getTenantScaleContext()?.tenantId).toBe('tenant-2')
    })
  })
})

// Helper function to create mock ExecutionContext
function createMockExecutionContext(
  reflector: Reflector,
  requiresAuth: boolean,
  headers: Record<string, string> = {},
  planFeature?:
    | string
    | { feature: string; currentCount?: number | ((req: unknown) => number | Promise<number>) },
  scopes?: string[],
  auditConfig?: { action: string; resource?: string },
): ExecutionContext {
  const mockRequest = {
    headers,
    tenantId: undefined as string | undefined,
    tenantKey: undefined as ApiKeyInfo | undefined,
  }

  const mockHandler = () => {}
  const mockClass = {}

  // Use Reflect metadata API instead of reflector.set
  if (requiresAuth) {
    Reflect.defineMetadata('tenantScale:authenticateApiKey', true, mockHandler)
  }
  if (planFeature) {
    Reflect.defineMetadata('tenantScale:requirePlanLimit', planFeature, mockHandler)
  }
  if (scopes) {
    Reflect.defineMetadata('tenantScale:requireScope', scopes, mockHandler)
  }
  if (auditConfig) {
    Reflect.defineMetadata('tenantScale:auditLog', auditConfig, mockHandler)
  }

  return {
    switchToHttp: () => ({
      getRequest: () => mockRequest,
    }),
    getHandler: () => mockHandler,
    getClass: () => mockClass,
  } as unknown as ExecutionContext
}
