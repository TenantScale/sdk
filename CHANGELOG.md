# Changelog

## [0.4.0] — 2026-07-23

### Added

- **@tenantscale/koa** — Full Koa adapter with auth, session validation, plan limits, rate limits, audit logging, and error handling
- **@tenantscale/koa README** — Comprehensive API reference with examples for every middleware
- **Auto-assign workflow** — New issues auto-assigned to maintainers
- **Prettier format check** — CI now runs `pnpm format:check` to enforce consistent formatting

### Fixed

- **create-app bin name** — Corrected binary name to `create-tenantscale-app`
- **CodeQL alerts** — Removed sensitive data from error log context in rate-limit.ts and error-handler.ts
- **pnpm publish auth** — Fixed auth token configuration in npm publish workflow
- **DCO check** — Uses `pull_request_target` so workflow runs correctly from main
- **Labeler config** — Updated for `actions/labeler@v6` format
- **first-interaction action** — Replaced buggy third-party action with accurate API-based check
- **Various dependency bumps** — Latest minor/patch versions across all packages

## [0.3.0] — 2026-07-20

### Added

- **@tenantscale/fastify** — Fastify adapter with auth, scope checks, and error handling (contributed by [@peakcoder](https://github.com/GHisDW))
- **@tenantscale/koa** — Koa adapter scaffolding (contributed by [@ashudhanda](https://github.com/ashudhanda))
- **@tenantscale/drizzle** — Drizzle ORM tenant-safe query guard (contributed by [@peakcoder](https://github.com/GHisDW))
- **MCP server** — AI coding tool integration (@tenantscale/mcp)
- **npm publish workflow** — Automated publishing to npm via GitHub Actions

### Fixed

- **Security vulnerability** — Override `postcss` to >=8.5.10 to resolve CVE-2026-41305
- **Unused variables** — Removed CodeQL-flagged unused local variables

## [0.2.0] — 2026-07-08

### Added

- **@tenantscale/react** — React hooks: `useTenant`, `usePlan`, `useApiKeys`, `useTeam`, `useAuditLog`, `useWebhooks`
- **create-tenantscale-app** — Full-stack SaaS starter scaffolding tool
- **@tenantscale/cli** — CLI tools: `tenantscale init` and `tenantscale migrate`
- **@tenantscale/mcp** — MCP server for AI coding tool integration
- **Demo: Help Desk** — Working multi-tenant IT help desk demo application
- **OSS readiness** — CONTRIBUTING.md, CI/CD pipeline, issue templates, code quality configs
- **DCO check** — Enforces `Signed-off-by` on all commits
- **CodeQL analysis** — Security scanning with `security-extended` query suite
- **Auto-labeler** — PR area labels based on changed files
- **Good-first-issue catalog** — Curated list of beginner/intermediate/advanced issues for contributors

### Fixed

- **Pagination edge case** — Graceful fallback for invalid limit values (contributed by [@AniSam0000](https://github.com/AniSam0000))
- **Security contact** — Updated to matthew@thatdevmat.com
- **CI config** — Fixed coverage command, lint continue-on-error
- **Code of Conduct** — Updated maintainer email

## [0.1.0] — 2026-06-30

### Added

- **@tenantscale/sdk** — Framework-agnostic core: tenant isolation, API key auth, plan enforcement, rate limiting, audit logging, webhook dispatch, Stripe billing
- **@tenantscale/express** — Express.js middleware adapter
- **@tenantscale/hono** — Hono.js middleware adapter
- **@tenantscale/next** — Next.js App Router wrapper
- **@tenantscale/cli** — CLI tools (`init` + `migrate`)
- **Demo: Help Desk** — Full multi-tenant IT help desk demo
