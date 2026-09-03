# @tenantscale/nestjs

**NestJS adapter for TenantScale** — module registration, guards, interceptors, decorators, and dependency injection for API key authentication, plan enforcement, scope validation, and audit logging.

## Install

```bash
npm install @tenantscale/nestjs
# or
pnpm add @tenantscale/nestjs
```

## Quick Start

```ts
import { Module } from '@nestjs/common'
import { TenantScaleModule } from '@tenantscale/nestjs'

@Module({
  imports: [
    TenantScaleModule.forRoot({
      sdkOptions: {
        supabaseUrl: process.env.SUPABASE_URL,
        supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      },
    }),
  ],
})
export class AppModule {}
```

```ts
import { Controller, Get } from '@nestjs/common'
import {
  TenantScaleService,
  AuthenticateApiKey,
  RequirePlanLimit,
  AuditLog,
} from '@tenantscale/nestjs'

@Controller('users')
export class UsersController {
  constructor(private readonly tenantScale: TenantScaleService) {}

  @Get()
  @AuthenticateApiKey()
  @RequirePlanLimit('pro')
  @AuditLog({ action: 'List Users', resource: 'users' })
  async findUsers() {
    return this.tenantScale.sdk
  }
}
```

## Module Setup

### Synchronous Configuration (forRoot)

Use `forRoot` when you have all configuration available at module import time:

```ts
import { TenantScaleModule } from '@tenantscale/nestjs'
import { TenantScale } from '@tenantscale/sdk'

@Module({
  imports: [
    TenantScaleModule.forRoot({
      // Option 1: Pass an existing TenantScale instance
      tenantScale: new TenantScale({
        supabaseUrl: process.env.SUPABASE_URL,
        supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      }),

      // Option 2: Pass SDK options to create a new instance
      sdkOptions: {
        supabaseUrl: process.env.SUPABASE_URL,
        supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      },

      // Option 3: Use a factory function
      tenantScaleFactory: () => new TenantScale({/* ... */}),

      // Optional: Configure header names
      apiKeyHeader: 'x-api-key',
      authHeader: 'authorization',
    }),
  ],
})
export class AppModule {}
```

### Asynchronous Configuration (forRootAsync)

Use `forRootAsync` when you need to inject dependencies or load configuration asynchronously:

```ts
import { TenantScaleModule } from '@tenantscale/nestjs'
import { ConfigService } from '@nestjs/config'

@Module({
  imports: [
    TenantScaleModule.forRootAsync({
      // Make the module global (available to all modules without re-importing)
      global: true,

      // Inject dependencies
      inject: [ConfigService],

      // Use factory with injected dependencies
      useFactory: (config: ConfigService) => ({
        sdkOptions: {
          supabaseUrl: config.get('SUPABASE_URL'),
          supabaseKey: config.get('SUPABASE_SERVICE_ROLE_KEY'),
        },
      }),

      // Optional: Add custom providers
      providers: [],
    }),
  ],
})
export class AppModule {}
```

## Dependency Injection

### Inject TenantScaleService

```ts
import { Injectable } from '@nestjs/common'
import { TenantScaleService } from '@tenantscale/nestjs'

@Injectable()
export class UsersService {
  constructor(private readonly tenantScale: TenantScaleService) {}

  async createTenant() {
    return this.tenantScale.sdk.tenants.create({/* ... */})
  }
}
```

### Inject the raw SDK instance

```ts
import { Inject } from '@nestjs/common'
import { TENANT_SCALE_TOKEN } from '@tenantscale/nestjs'
import { TenantScale } from '@tenantscale/sdk'

@Injectable()
export class UsersService {
  constructor(@Inject(TENANT_SCALE_TOKEN) private readonly tenantScale: TenantScale) {}

  async createTenant() {
    return this.tenantScale.tenants.create({/* ... */})
  }
}
```

## Guards

### TenantScaleGuard

The guard handles API key authentication, scope validation, and plan limit enforcement.

```ts
import { Controller, UseGuards } from '@nestjs/common'
import { TenantScaleGuard, AuthenticateApiKey } from '@tenantscale/nestjs'

@Controller('protected')
@UseGuards(TenantScaleGuard)
export class ProtectedController {
  @Get()
  @AuthenticateApiKey()
  async handler() {
    // Authenticated
  }
}
```

### Applying Guards Globally

```ts
import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { TenantScaleGuard } from '@tenantscale/nestjs'

@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: TenantScaleGuard,
    },
  ],
})
export class AppModule {}
```

## Interceptors

### TenantScaleInterceptor

The interceptor handles audit logging for successful requests.

```ts
import { Controller, UseInterceptors } from '@nestjs/common'
import { TenantScaleInterceptor, AuditLog } from '@tenantscale/nestjs'

@Controller('users')
@UseInterceptors(TenantScaleInterceptor)
export class UsersController {
  @Post()
  @AuditLog({ action: 'User Created', resource: 'users' })
  async createUser() {
    // Audit log will be created on success
  }
}
```

## Decorators

### @AuthenticateApiKey

Marks a route or controller as requiring API key authentication:

```ts
@Get()
@AuthenticateApiKey()
async handler() { }
```

### @RequirePlanLimit

Requires a specific plan feature. Automatically applies the guard:

```ts
@Get()
@RequirePlanLimit('pro')
async premiumFeature() { }
```

You can optionally provide a current count to enforce specific limits:

```ts
@Get()
@RequirePlanLimit('pro', 3)
async premiumFeature() { }
```

Or use a function to dynamically calculate the count from the request:

```ts
@Post('items')
@RequirePlanLimit('pro', (req) => req.body.items.length)
async createItems() { }
```

### @RequireScope

Requires specific API key scopes. Automatically applies the guard:

```ts
@Get()
@RequireScope('read:users', 'write:users')
async adminAction() { }
```

### @AuditLog

Enables audit logging for a route:

```ts
@Post()
@AuditLog({ action: 'User Created', resource: 'users', details: { userId: 123 } })
async createUser() { }
```

## Parameter Decorators

### @TenantContext

Injects the full tenant context into a controller method:

```ts
@Get()
async getData(@TenantContext() tenant: TenantScaleRequestContext) {
  console.log(tenant.tenantId)
  console.log(tenant.tenantKey)
}
```

### @TenantId

Injects just the tenant ID:

```ts
@Get()
async getData(@TenantId() tenantId: string) {
  console.log(tenantId)
}
```

## Request Context

The guard sets tenant context on the request object and in AsyncLocalStorage:

```ts
import { getTenantScaleContext, runWithTenantScaleContext } from '@tenantscale/nestjs'

// Access context in background jobs
const context = getTenantScaleContext()
if (context?.tenantId) {
  // Use tenantId
}

// Run code with specific context
runWithTenantScaleContext({ tenantId: 'tenant-123' }, async () => {
  // This code has access to tenant context
})
```

### Request Object Mutation

When `TenantScaleGuard` successfully authenticates a request, it attaches tenant data to the request object:

- `req.tenantKey` - The full API key info object
- `req.tenantId` - The tenant ID string

This follows standard NestJS patterns where guards attach request-scoped data to the request object for downstream use. If you need to access tenant data in your controllers without using parameter decorators, you can access it directly from the request:

```ts
@Get('data')
getData(@Req() req: Request) {
  const tenantId = req.tenantId as string | undefined
  const tenantKey = req.tenantKey as ApiKeyInfo | undefined
  // Use tenant data
}
```

## Complete Example

```ts
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TenantScaleModule } from '@tenantscale/nestjs'
import { UsersController } from './users.controller'

@Module({
  imports: [
    ConfigModule.forRoot(),
    TenantScaleModule.forRootAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        sdkOptions: {
          supabaseUrl: config.get('SUPABASE_URL'),
          supabaseKey: config.get('SUPABASE_SERVICE_ROLE_KEY'),
        },
        apiKeyHeader: 'x-api-key',
      }),
    }),
  ],
  controllers: [UsersController],
})
export class AppModule {}
```

```ts
import { Controller, Get, Post, UseInterceptors } from '@nestjs/common'
import {
  TenantScaleService,
  AuthenticateApiKey,
  RequirePlanLimit,
  RequireScope,
  AuditLog,
  TenantId,
} from '@tenantscale/nestjs'
import { TenantScaleInterceptor } from '@tenantscale/nestjs'

@Controller('users')
@UseInterceptors(TenantScaleInterceptor)
export class UsersController {
  constructor(private readonly tenantScale: TenantScaleService) {}

  @Get()
  @AuthenticateApiKey()
  async findAll(@TenantId() tenantId: string) {
    return this.tenantScale.sdk.tenants.get(tenantId)
  }

  @Post()
  @AuthenticateApiKey()
  @RequireScope('write:users')
  @AuditLog({ action: 'User Created', resource: 'users' })
  async create(@TenantId() tenantId: string) {
    // Create user logic
  }

  @Get('premium')
  @AuthenticateApiKey()
  @RequirePlanLimit('pro')
  async premiumFeature(@TenantId() tenantId: string) {
    // Premium feature logic
  }
}
```

## API Reference

### TenantScaleModule

- `forRoot(options: TenantScaleModuleOptions): DynamicModule` - Synchronous module registration
- `forRootAsync(asyncOptions: TenantScaleModuleAsyncOptions): DynamicModule` - Asynchronous module registration

### TenantScaleService

- `sdk: TenantScale` - Access to the raw TenantScale SDK instance
- `moduleOptions: TenantScaleModuleOptions` - Access to module configuration
- `authenticateApiKey(token: string): Promise<ApiKeyInfo>` - Validate an API key
- `requireScope(apiKey: ApiKeyInfo, ...scopes: string[]): void` - Check if API key has required scopes
- `requirePlanLimit(tenantId: string, feature: string, currentCount: number | (() => number | Promise<number>)): Promise<void>` - Check plan limits
- `auditLog(tenantId: string, action: string, resource: string, details?: Record<string, unknown>): Promise<void>` - Log an audit event

### Decorators

- `@AuthenticateApiKey()` - Require API key authentication
- `@RequirePlanLimit(feature: string, currentCount?: number | ((req: unknown) => number | Promise<number>))` - Require specific plan feature
- `@RequireScope(...scopes: string[])` - Require specific API key scopes
- `@AuditLog(config: { action: string; resource?: string; details?: Record<string, unknown> })` - Enable audit logging

### Parameter Decorators

- `@TenantContext()` - Inject full tenant context
- `@TenantId()` - Inject tenant ID only

### Context Functions

- `getTenantScaleContext(): TenantScaleRequestContext | undefined` - Get current tenant context from AsyncLocalStorage
- `runWithTenantScaleContext(context: TenantScaleRequestContext, callback: () => T): T` - Run callback with tenant context
- `setTenantScaleContext(context: TenantScaleRequestContext): void` - Set tenant context in AsyncLocalStorage

## Limitations

- **Platform Support**: Works with both Express and Fastify-based NestJS applications. The guard uses platform-agnostic request handling.
- **Request-Scoped Providers**: The TenantScale instance is a singleton. If you need request-scoped behavior, use the AsyncLocalStorage context functions.
- **Concurrent Requests**: AsyncLocalStorage ensures context isolation for concurrent requests, but be careful when using background jobs that may outlive the request.

## Unsupported Scenarios

- **WebSocket Authentication**: This adapter is designed for HTTP requests. WebSocket authentication requires a different approach.
- **GraphQL Resolvers**: While the guard works with GraphQL, you may need additional configuration for resolver-level authentication.
- **Microservices**: This adapter is designed for HTTP-based NestJS applications, not microservice patterns.

## Common Pitfalls

### Missing Tenant ID

Always check if `tenantId` exists before using it:

```ts
@Get()
async getData(@TenantId() tenantId: string | undefined) {
  if (!tenantId) {
    throw new BadRequestException('Tenant ID required')
  }
  // Proceed with tenantId
}
```

### Guard Not Applied

Decorators like `@RequirePlanLimit` and `@RequireScope` automatically apply the guard, but `@AuthenticateApiKey` does not. Either use `@UseGuards(TenantScaleGuard)` or use the decorators that include the guard:

```ts
// ❌ This won't work - guard not applied
@Get()
@AuthenticateApiKey()
async handler() { }

// ✅ Use decorators that include the guard
@Get()
@RequirePlanLimit('pro')
async handler() { }

// ✅ Or apply guard explicitly
@Get()
@UseGuards(TenantScaleGuard)
@AuthenticateApiKey()
async handler() { }
```

### Async Context in Background Jobs

When spawning background jobs, the AsyncLocalStorage context is not automatically propagated. Use `runWithTenantScaleContext`:

```ts
@Post()
async createJob(@TenantContext() context: TenantScaleRequestContext) {
  // Context is lost in background job
  this.queue.add('process', { /* ... */ })

  // Preserve context explicitly
  this.queue.add('process', { context })
}
```

## License

MIT
