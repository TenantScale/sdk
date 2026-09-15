# TenantScale × NestJS Demo

A minimal, runnable multi-tenant NestJS app that shows the
[`@tenantscale/nestjs`](https://www.npmjs.com/package/@tenantscale/nestjs) adapter in
action — API-key auth, scope enforcement, plan limits, audit logging, and
per-tenant isolation.

It uses an in-memory **mock** TenantScale client (`src/mock-tenant-scale.ts`), so it
runs with zero configuration — no Supabase, no credentials. Swap in real
`sdkOptions` to connect to your actual tenant database (see the commented block
in `src/app.module.ts`).

## What it demonstrates

| Feature                                                | Where               |
| ------------------------------------------------------ | ------------------- |
| `TenantScaleModule.forRoot()`                          | `app.module.ts`     |
| `@AuthenticateApiKey()` guards                         | `WidgetsController` |
| `@RequireScope('read:users' / 'write:users')`          | `WidgetsController` |
| `@RequirePlanLimit('widgets', fn)` — fail-closed count | `create()`          |
| `@AuditLog(...)` + `TenantScaleInterceptor`            | `WidgetsController` |
| `@TenantId()` per-request tenant context               | each handler        |
| Per-tenant isolation (rows filtered by `tenant_id`)    | in-memory store     |

## Run it

```bash
# from the repo root
pnpm install
pnpm --filter @tenantscale/demo-nestjs start
```

The server listens on `http://localhost:3000`.

## Try it

```bash
# List widgets (demo-acme-key has read:users)
curl -i -H "x-api-key: demo-acme-key" "http://localhost:3000/widgets"

# Create a widget (needs write:users + plan limit)
curl -i -X POST -H "x-api-key: demo-acme-key" \
  -H "content-type: application/json" \
  -d '{"name":"widget-1"}' \
  "http://localhost:3000/widgets"

# demo-globex-key has read:users only -> POST should fail with 403
curl -i -X POST -H "x-api-key: demo-globex-key" \
  -H "content-type: application/json" \
  -d '{"name":"widget-2"}' \
  "http://localhost:3000/widgets"

# No key / bad key -> 401
curl -i "http://localhost:3000/widgets"
```

**Demo tenants:** `demo-acme-key` (`read:users`,`write:users`) and
`demo-globex-key` (`read:users`).

## Wiring it into a real app

Replace `TenantScaleModule.forRoot({ tenantScale: mock })` in `app.module.ts`
with either a real `TenantScale` instance or `sdkOptions` pointing at Supabase:

```ts
TenantScaleModule.forRoot({
  sdkOptions: {
    supabaseUrl: process.env.SUPABASE_URL!,
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  },
})
```
