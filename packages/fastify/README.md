# @tenantscale/fastify

Fastify middleware for TenantScale — multi-tenant API key authentication, portal session validation, plan enforcement, rate limiting, and audit logging for Fastify apps.

## Install

```bash
npm install @tenantscale/fastify fastify
# or
pnpm add @tenantscale/fastify fastify
```

Requires `@tenantscale/sdk` as a peer dependency.

## Quick Start

```ts
import Fastify from 'fastify'
import { TenantScale } from '@tenantscale/sdk'
import { authenticateApiKey, errorHandler } from '@tenantscale/fastify'

const ts = new TenantScale({ /* SDK config */ })
const app = Fastify()

// Register error handler first — catches downstream errors and
// maps TenantScale errors to structured JSON responses
app.setErrorHandler(errorHandler())

// Authenticate every request via the x-api-key header
app.addHook('preHandler', authenticateApiKey({ ts }))

app.get('/api/me', async (request, reply) => {
  return { tenantId: request.tenantId }
})

await app.listen({ port: 3000 })
```

## Options

Every middleware takes a `FastifyAdapterOptions` object as its first argument:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ts` | `TenantScale` | — (required) | TenantScale SDK instance |
| `audit` | `boolean` | `true` | Log an audit event on successful API key authentication |
| `apiKeyHeader` | `string` | `'x-api-key'` | Header name for API key authentication |
| `authHeader` | `string` | `'authorization'` | Header name for portal session authentication |

## API Reference

### `authenticateApiKey(options)`

Validates the API key from the configured header, sets `request.tenantKey` (an `ApiKeyInfo`) and `request.tenantId`, and logs an `api_key.authenticated` audit event unless `audit: false`. Responds `401` / `AUTH_FAILED` when the key is missing or invalid.

```ts
app.addHook('preHandler', authenticateApiKey({ ts }))
```

### `requireScope(options, ...scopes)`

Requires the authenticated API key to hold the given scopes. Run after `authenticateApiKey`. Responds `403` / `MISSING_SCOPE`.

```ts
app.addHook('preHandler', authenticateApiKey({ ts }))
app.addHook('preHandler', requireScope({ ts }, 'admin'))
```

### `requirePortalSession(options)`

Validates a `Bearer <token>` portal session from the `Authorization` header. Sets `request.portalSession` (a `PortalSessionInfo`) and `request.tenantId` when tenant-bound. Responds `401` / `SESSION_INVALID`.

```ts
app.addHook('preHandler', requirePortalSession({ ts }))
```

### `requirePortalRole(options, ...roles)`

Requires the portal session to hold one of the given roles. Run after `requirePortalSession`. Responds `403` / `MISSING_ROLE`.

### `requireSuperAdmin(options)`

Requires a super admin portal session. Run after `requirePortalSession`. Responds `403` / `NOT_SUPER_ADMIN`.

### `requirePlanLimit(options, feature, currentCount)`

Checks the tenant's usage of `feature` against their plan limit. `currentCount` is a number or a (possibly async) `(request) => number` function. A `null` plan limit means unlimited. Requires `request.tenantId`, so run after `authenticateApiKey` or `requirePortalSession`. Responds `403` / `PLAN_LIMIT_REACHED`.

```ts
app.post('/api/projects', {
  preHandler: [
    authenticateApiKey({ ts }),
    requirePlanLimit({ ts }, 'projects', async (request) => countProjects(request.tenantId)),
  ],
}, handler)
```

### `rateLimitByApiKey(options)`

Enforces the tenant's daily request limit for the authenticated API key. Run after `authenticateApiKey`. Responds `429` / `DAILY_LIMIT_EXCEEDED`.

### `rateLimitByIp(options)`

Rate limits by client IP (resolved from `x-forwarded-for`, then `x-real-ip`). Useful for unauthenticated routes such as signup. Sets `Retry-After` and responds `429` / `IP_RATE_LIMITED` when blocked.

### `auditLog(options, config)`

Writes an audit event for the route. Fire-and-forget: failures are logged via `ts.logger` and never block the request. No-op when `request.tenantId` is not resolved.

```ts
import { auditLog } from '@tenantscale/fastify'

app.post('/api/tickets', {
  preHandler: [
    authenticateApiKey({ ts }),
    auditLog({ ts }, {
      action: 'ticket.created',
      resource: '/api/tickets',
      actorType: 'user',
      getDetails: (request) => ({ body: request.body }),
    }),
  ],
}, handler)
```

### `errorHandler(options?)`

Returns a Fastify error handler that catches downstream errors and maps `TenantScaleError` subclasses to structured JSON. Adds `details` (`{ limit, current }` for plan limit errors, `{ planLimit }` for rate limit errors) and a `Retry-After` header when applicable. Non-TenantScale errors become `500` / `INTERNAL_ERROR` (message hidden when `NODE_ENV=production`). Register it before other middleware.

```ts
app.setErrorHandler(errorHandler())
```

Error response shape:

```ts
interface ErrorResponse {
  error: string
  code: string
  statusCode: number
  details?: Record<string, unknown>
}
```

## Decorated Properties

| Property | Set by | Type |
|----------|--------|------|
| `request.tenantKey` | `authenticateApiKey` | `ApiKeyInfo` |
| `request.tenantId` | `authenticateApiKey` / `requirePortalSession` | `string` |
| `request.portalSession` | `requirePortalSession` | `PortalSessionInfo` |

`ApiKeyInfo` and `PortalSessionInfo` are re-exported from this package.

## Error Codes

| Middleware | HTTP Status | Code |
|------------|-------------|------|
| `authenticateApiKey` | 401 | `AUTH_FAILED` |
| `requirePortalSession` | 401 | `SESSION_INVALID` |
| `requireScope` | 403 | `MISSING_SCOPE` |
| `requirePortalRole` | 403 | `MISSING_ROLE` |
| `requireSuperAdmin` | 403 | `NOT_SUPER_ADMIN` |
| `requirePlanLimit` | 403 | `PLAN_LIMIT_REACHED` |
| `rateLimitByApiKey` | 429 | `DAILY_LIMIT_EXCEEDED` |
| `rateLimitByIp` | 429 | `IP_RATE_LIMITED` |
| `errorHandler` (fallback) | 500 | `INTERNAL_ERROR` |

## Documentation

- Adapter guides: [TenantScale docs — Framework Adapters](https://github.com/TenantScale/docs/tree/main/adapters)
- Core SDK: [`@tenantscale/sdk`](../sdk/README.md)
