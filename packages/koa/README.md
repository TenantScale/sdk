# @tenantscale/koa

Koa middleware for TenantScale — multi-tenant API key authentication, portal session validation, plan enforcement, rate limiting, and audit logging for Koa apps.

## Install

```bash
npm install @tenantscale/koa koa
# or
pnpm add @tenantscale/koa koa
```

Requires `@tenantscale/sdk` as a peer dependency.

## Quick Start

```ts
import Koa from 'koa'
import { TenantScale } from '@tenantscale/sdk'
import { authenticateApiKey, errorHandler } from '@tenantscale/koa'

const ts = new TenantScale({ /* SDK config */ })
const app = new Koa()

// Register first: wraps downstream middleware and maps
// TenantScale errors to structured JSON responses
app.use(errorHandler())

// Authenticate every request via the x-api-key header
app.use(authenticateApiKey({ ts }))

app.use(async (ctx) => {
  ctx.body = { tenantId: ctx.tenantId }
})

app.listen(3000)
```

## Options

Every middleware takes a `KoaAdapterOptions` object as its first argument:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ts` | `TenantScale` | — (required) | TenantScale SDK instance |
| `audit` | `boolean` | `true` | Log an audit event on successful API key authentication |
| `apiKeyHeader` | `string` | `'x-api-key'` | Header name for API key authentication |
| `authHeader` | `string` | `'authorization'` | Header name for portal session authentication |

## API Reference

### `authenticateApiKey(options)`

Validates the API key from the configured header, sets `ctx.tenantKey` (an `ApiKeyInfo`) and `ctx.tenantId`, and logs an `api_key.authenticated` audit event unless `audit: false`. Responds `401` / `AUTH_FAILED` when the key is missing or invalid.

```ts
app.use(authenticateApiKey({ ts }))
```

### `requireScope(options, ...scopes)`

Requires the authenticated API key to hold the given scopes. Run after `authenticateApiKey`. Responds `403` / `MISSING_SCOPE`.

```ts
router.delete('/tenants/:id', authenticateApiKey({ ts }), requireScope({ ts }, 'admin'), handler)
```

### `requirePortalSession(options)`

Validates a `Bearer <token>` portal session from the `Authorization` header. Sets `ctx.portalSession` (a `PortalSessionInfo`) and `ctx.tenantId` when tenant-bound. Responds `401` / `SESSION_INVALID`.

```ts
router.get('/portal/dashboard', requirePortalSession({ ts }), handler)
```

### `requirePortalRole(options, ...roles)`

Requires the portal session to hold one of the given roles. Run after `requirePortalSession`. Responds `403` / `MISSING_ROLE`.

### `requireSuperAdmin(options)`

Requires a super admin portal session. Run after `requirePortalSession`. Responds `403` / `NOT_SUPER_ADMIN`.

### `requirePlanLimit(options, feature, currentCount)`

Checks the tenant's usage of `feature` against their plan limit. `currentCount` is a number or a (possibly async) `(ctx) => number` function. A `null` plan limit means unlimited. Requires `ctx.tenantId`, so run after `authenticateApiKey` or `requirePortalSession`. Responds `403` / `PLAN_LIMIT_REACHED`.

```ts
router.post(
  '/projects',
  authenticateApiKey({ ts }),
  requirePlanLimit({ ts }, 'projects', async (ctx) => countProjects(ctx.tenantId)),
  handler,
)
```

### `rateLimitByApiKey(options)`

Enforces the tenant's daily request limit for the authenticated API key. Run after `authenticateApiKey`. Responds `429` / `DAILY_LIMIT_EXCEEDED`.

### `rateLimitByIp(options)`

Rate limits by client IP (resolved from `x-forwarded-for`, then `x-real-ip`). Useful for unauthenticated routes such as signup. Sets `Retry-After` and responds `429` / `IP_RATE_LIMITED` when blocked.

### `auditLog(options, config)`

Writes an audit event for the route. Fire-and-forget: failures are logged via `ts.logger` and never block the request. No-op when `ctx.tenantId` is not resolved.

```ts
auditLog({ ts }, {
  action: 'ticket.created',
  resource: '/api/tickets',
  actorType: 'user', // 'user' | 'system' | 'admin_api' | 'admin_impersonation'
  getDetails: (ctx) => ({ body: ctx.request.body }),
})
```

### `errorHandler(options?)`

Returns a Koa middleware that catches downstream errors and maps `TenantScaleError` subclasses to structured JSON. Adds `details` (`{ limit, current }` for plan limit errors, `{ planLimit }` for rate limit errors) and a `Retry-After` header when applicable. Non-TenantScale errors become `500` / `INTERNAL_ERROR` (message hidden when `NODE_ENV=production`). Register it before other middleware.

Error response shape:

```ts
interface ErrorResponse {
  error: string
  code: string
  statusCode: number
  details?: Record<string, unknown>
}
```

## Context State

| Property | Set by | Type |
|----------|--------|------|
| `ctx.tenantKey` | `authenticateApiKey` | `ApiKeyInfo` |
| `ctx.tenantId` | `authenticateApiKey` / `requirePortalSession` | `string` |
| `ctx.portalSession` | `requirePortalSession` | `PortalSessionInfo` |

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
