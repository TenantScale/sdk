# DeskScale — Multi-tenant white-label chat/CRM demo

A fully-featured, **runnable demo** that shows TenantScale's NestJS adapter in a
real, clickable UI. DeskScale is a white-label support desk SaaS: one app that
Acme Corp, Globex Industries, and Initech each use — and each company sees only
**its own** contacts, conversations, and branding.

Built entirely on TenantScale's own stack — `@tenantscale/nestjs` + the SDK — so
the demo _is_ the product running.

## What it demonstrates (mapped to SDK features)

| In the UI                                                                        | TenantScale feature               |
| -------------------------------------------------------------------------------- | --------------------------------- |
| Sign in as a company → the whole app **re-skins** to that tenant's brand color   | `@TenantId()` request context     |
| Each tenant's inbox shows **only its own** conversations                         | tenant-isolated queries           |
| Opening another tenant's conversation → blocked / isolated                       | `@TenantId()` + scoped queries    |
| Agent vs Admin roles gate actions                                                | `@RequireScope`                   |
| Create a conversation → capped by plan (free = 3)                                | `@RequirePlanLimit` (fail-closed) |
| Superadmin Platform Desk → sees all tenants                                      | `@RequireScope('admin:view')`     |
| **Live Request Pulse** pane → every call tagged `tenant / scope / rule → status` | adapter guard resolution          |

## Architecture

```
demos/deskscale/
  src/api/            NestJS API on Tenantscale's NestJS adapter
    db/               SQLite via better-sqlite3 + drizzle-orm
    demo-store.ts     SQLite-backed TenantScale (the self-contained client)
    *.controller.ts   tenantscope-guarded routes
    pulse.service.ts  live request pulse
  web/                React SPA (Vite) — branded multi-tenant UI
  vite.config.ts      dev proxy: /api → :4000
```

Key idea: `DemoStore` implements the `@tenantscale/sdk` surface the NestJS
adapter relies on (`validateApiKey`, `requireScope`, `plans.getPlanLimit`,
`logAuditEvent`), reading tenants/agents/limits **from the same local SQLite DB**.
This makes the demo fully self-contained (no Supabase) while exercising the real
adapter + decorators end to end.

## Run it

```bash
pnpm install
pnpm --filter @tenantscale/demo-deskscale seed   # create + populate SQLite
pnpm --filter @tenantscale/demo-deskscale dev     # API :4000 + frontend :5173
```

Open **http://localhost:5173**.

## Demo credentials (one-click login buttons)

| Button            | API key             | Tenant   | Scopes                                          |
| ----------------- | ------------------- | -------- | ----------------------------------------------- |
| Acme Corp · Admin | `acme-admin-key`    | Acme     | read/reply/manage conversations + manage agents |
| Acme Corp · Agent | `acme-agent-key`    | Acme     | read + reply only (no manage)                   |
| Globex · Admin    | `globex-admin-key`  | Globex   | full                                            |
| Globex · Agent    | `globex-agent-key`  | Globex   | read + reply only                               |
| Initech · Free    | `initech-admin-key` | Initech  | full, but **3-conversation plan cap**           |
| Superadmin        | `superadmin-key`    | platform | `admin:view` (Platform Desk)                    |

## Try the money shot

1. Sign in as **Acme Admin** → see Acme's 2 conversations.
2. Sign out → sign in as **Globex Admin** → completely different inbox. Acme's
   conversations are nowhere.
3. Click **"🔍 Try cross-tenant probe"** → it attempts to open another tenant's
   conversation and returns **ISOLATED** — watch the Live Request Pulse record it.
4. Sign in as **Initech** (free) and try to create past 3 conversations → blocked
   by `@RequirePlanLimit`.
5. Sign in as **Superadmin** → Platform Desk shows all tenants side by side.

## Notes

- Demo DB is `deskscale.db` (gitignored) — re-run `pnpm seed` to reset.
- `demo-store.ts` throws real SDK error classes so the adapter maps 401/403
  correctly; swap in real `sdkOptions` (Supabase) for production behavior.
