# Contributing to TenantScale

First off, thanks for taking the time to contribute! 🎉

> **Every contributor gets listed in our README.** Whether it's a typo fix, a new adapter, or a test improvement — you show up. See [README.md](README.md#-contributing).

---

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [What We're Building](#what-were-building)
- [Good First Issues](#-good-first-issues)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Adding a New Adapter](#adding-a-new-adapter)
- [Pull Request Process](#pull-request-process)
- [Code Style & Quality](#code-style--quality)
- [Getting Help](#getting-help)

---

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to the maintainers.

---

## What We're Building

TenantScale is a **framework-agnostic multi-tenant middleware SDK** for B2B SaaS. The core `@tenantscale/sdk` package handles auth, plan enforcement, rate limiting, audit logging, webhooks, and billing — and adapter packages wrap it for specific frameworks (Express, Hono, Next.js, React).

**The mission:** Make multi-tenancy a 10-minute setup instead of a 2-month project.

---

## 🎯 Good First Issues

These are issues specifically scoped for first-time contributors. Each should take **a few hours to a weekend** to complete.

### Beginner

| Issue | What You'll Do | Skills |
|-------|---------------|--------|
| **Add bundlephobia badge to a package README** | Add an npm badge showing bundle size. Following an existing pattern. | Markdown, npm |
| **Improve error messages** | Make SDK error messages more actionable for developers | TypeScript |
| **Add test for pagination edge case** | Write tests for `page=0`, negative limits, extreme values | TypeScript, Vitest |
| **Add SECURITY.md disclosure contacts** | Improve the security policy with clearer contact info | Markdown |
| **Fix typos / improve docs** | Clean up documentation across packages | English, Markdown |

### Intermediate

| Issue | What You'll Do | Skills |
|-------|---------------|--------|
| **Add Fastify adapter** | Create `packages/fastify/` following the Express/Hono pattern | TypeScript, Fastify |
| **Add Koa adapter** | Create `packages/koa/` following the Express/Hono pattern | TypeScript, Koa |
| **Add coverage badge to CI** | Generate a code coverage report and comment on PRs | GitHub Actions, Vitest |
| **Create a NestJS module** | Wrap the SDK as a NestJS `DynamicModule` | TypeScript, NestJS |
| **Add Prisma query guard** | Create a helper that auto-appends `WHERE tenant_id = ?` to Prisma queries | TypeScript, Prisma |
| **Add Drizzle query guard** | Same as above but for Drizzle ORM | TypeScript, Drizzle |
| **Add Soketi/WebSocket adapter** | Emit real-time events when webhooks fire | TypeScript, WebSockets |

### Advanced

| Issue | What You'll Do | Skills |
|-------|---------------|--------|
| **OpenTelemetry instrumentation** | Add OTEL spans to core SDK operations | OpenTelemetry, TypeScript |
| **Rate limiter Redis backend** | Add a Redis-backed rate limiter alongside the in-memory one | Redis, TypeScript |
| **SSO / SAML integration** | Enterprise IdP support via Passport or similar | SAML, OAuth, TypeScript |

> **Don't see something you like?** Open an issue or start a [Discussion](https://github.com/TenantScale/sdk/discussions) with your idea.

---

## Getting Started

### Prerequisites

- **Node.js** >= 22 (**Node 24 recommended** — we develop against it; use [nvm](https://github.com/nvm-sh/nvm), `.nvmrc` is included)
- **pnpm** >= 9 (install via `npm install -g pnpm` or `corepack enable && corepack prepare pnpm@latest --activate`)

### Setup

```bash
# Clone the repo
git clone https://github.com/TenantScale/sdk.git
cd sdk

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run all tests
pnpm test
```

### Common Commands

```bash
pnpm dev              # Watch mode — rebuilds on file changes
pnpm build            # Build all packages
pnpm test             # Run all tests across all packages
pnpm test -- --filter=@tenantscale/sdk   # Test a single package
pnpm test -- --coverage                   # Generate coverage report
pnpm lint             # Lint all packages
pnpm format           # Auto-format with Prettier
pnpm format:check     # Check formatting (CI uses this)
pnpm clean            # Remove all dist/ and node_modules/
```

> **Tip:** Use `--filter=<package>` with any turbo command to scope work to one package. This is much faster than a full build/test cycle.

### Package-Specific Scripts

Each package also has its own scripts you can run from its directory:

```bash
cd packages/sdk
pnpm test:watch       # Run tests in watch mode
pnpm typecheck        # TypeScript type-check only (faster than build)
pnpm build:types      # Generate .d.ts files only
```

---

## Project Structure

```
tenantscale-sdk/
├── packages/
│   ├── sdk/               # Framework-agnostic core (@tenantscale/sdk)
│   │   ├── src/
│   │   │   ├── sdk.ts       # Main TenantScale class
│   │   │   ├── auth.ts      # API key validation + scope checks
│   │   │   ├── session.ts   # Portal session validation
│   │   │   ├── plan.ts      # Plan store + limit resolution
│   │   │   ├── rate-limit.ts # Daily + IP rate limiting
│   │   │   ├── audit.ts     # Audit event logging
│   │   │   ├── webhook.ts   # Webhook dispatch + retry
│   │   │   ├── api-key.ts   # Key generation + hashing
│   │   │   ├── pagination.ts # Pagination parsing + response
│   │   │   ├── ssrf.ts      # Webhook URL validation
│   │   │   ├── stripe.ts    # Stripe billing integration
│   │   │   └── types.ts     # Shared types + error classes
│   │   └── __tests__/       # Vitest test suite (182 tests)
│   ├── express/            # Express.js adapter (@tenantscale/express)
│   │   ├── src/
│   │   │   ├── middleware.ts # authenticateApiKey, requireScope, etc.
│   │   │   ├── error-handler.ts
│   │   │   └── types.ts
│   │   └── __tests__/       # 40 tests
│   ├── hono/               # Hono.js adapter (@tenantscale/hono)
│   │   ├── src/
│   │   │   ├── middleware.ts # authenticateApiKey, requireScope, etc.
│   │   │   ├── error-handler.ts
│   │   │   └── types.ts
│   │   └── __tests__/       # 30 tests
│   ├── next/               # Next.js App Router adapter (@tenantscale/next)
│   │   ├── src/
│   │   │   ├── authenticate.ts
│   │   │   ├── handler.ts
│   │   │   └── types.ts
│   │   └── __tests__/       # 24 tests
│   ├── react/              # React hooks (@tenantscale/react)
│   │   ├── src/
│   │   │   ├── hooks/       # useTenant, usePlan, useApiKeys, etc.
│   │   │   ├── context.tsx
│   │   │   ├── client.ts
│   │   │   └── ssr.ts
│   │   └── __tests__/       # 8 tests
│   ├── fastify/            # Fastify adapter (@tenantscale/fastify)
│   │   ├── src/
│   │   │   ├── middleware.ts
│   │   │   ├── error-handler.ts
│   │   │   └── types.ts
│   │   └── __tests__/       # 12 tests
│   ├── koa/                # Koa adapter (@tenantscale/koa)
│   │   ├── src/
│   │   │   ├── middleware.ts
│   │   │   ├── error-handler.ts
│   │   │   └── types.ts
│   │   └── __tests__/       # 10 tests
│   ├── drizzle/            # Drizzle ORM query guard (@tenantscale/drizzle)
│   │   ├── src/
│   │   │   └── index.ts
│   │   └── __tests__/       # 6 tests
│   ├── mcp/                # MCP server (@tenantscale/mcp)
│   │   ├── src/
│   │   │   ├── tools.ts
│   │   │   └── index.ts
│   │   └── __tests__/       # 4 tests
│   ├── cli/                # CLI tools (@tenantscale/cli)
│   │   ├── src/
│   │   │   ├── commands/    # init, migrate
│   │   │   └── generators/
│   │   └── __tests__/       # 18 tests
│   └── create-app/         # Full-stack starter (create-tenantscale-app)
│       └── __tests__/      # 2 tests
├── demos/
│   └── help-desk/          # Working multi-tenant demo app
├── .github/
│   ├── workflows/ci.yml    # CI pipeline
│   ├── ISSUE_TEMPLATE/     # Bug + feature request templates
│   └── PULL_REQUEST_TEMPLATE.md
├── vitest.workspace.ts
└── turbo.json
```

---

## Development Workflow

### 1. Find or Create an Issue

- Browse [`good first issue`](https://github.com/TenantScale/sdk/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) or [`help wanted`](https://github.com/TenantScale/sdk/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) labels
- Comment on the issue to let others know you're working on it
- If you have a new idea, open a feature request first — we'd rather discuss than have you build something that doesn't fit

### 2. Fork & Branch

```bash
git checkout -b feat/my-feature          # New feature
git checkout -b fix/description          # Bug fix
git checkout -b docs/description         # Documentation
git checkout -b adapters/fastify         # New adapter
```

Branch naming:
- `feat/` — new features
- `fix/` — bug fixes
- `docs/` — documentation
- `refactor/` — code improvements without behaviour change
- `test/` — adding or fixing tests
- `adapters/` — new framework adapters (Fastify, Koa, etc.)

### 3. Make Changes

```bash
# Code
code packages/sdk/src/sdk.ts

# Test alongside — we require tests for all new logic
code packages/sdk/__tests__/sdk.test.ts
```

### 4. Run Tests

```bash
# Full test suite (expect this to pass before pushing)
pnpm test

# Quick iteration on a single package
pnpm test -- --filter=@tenantscale/hono

# With coverage
pnpm test -- --coverage
```

### 5. Commit

We use [Conventional Commits](https://www.conventionalcommits.org/). Commit messages are linted by commitlint and Husky:

```
feat(scope): description in imperative mood
│      │
│      └─ package scope (sdk, express, hono, next, react, cli)
│
└─ type: feat, fix, chore, docs, refactor, test, perf, ci, style
```

**Examples:**

```bash
git commit -m "feat(sdk): add Redis-backed rate limiter"
git commit -m "fix(express): handle missing x-api-key header gracefully"
git commit -m "docs(react): add useWebhooks example to README"
git commit -m "test(hono): add SSRF validation edge case tests"
git commit -m "refactor(sdk): extract IP resolution into shared util"
```

> Don't worry about Husky blocking your commit — if your message fails validation, just fix the format. Your commit message becomes the PR title, which our CI validates anyway.

### 6. Push & Open a PR

```bash
git push -u origin HEAD
```

Then open a pull request on GitHub targeting `main`. Use the PR template and link the issue you're fixing.

---

## Adding a New Adapter

This is one of the most valuable contributions you can make. Here's how:

### Template: Copy the Hono adapter

```bash
cp -r packages/hono packages/fastify
```

### What to change

| File | Change |
|------|--------|
| `packages/fastify/package.json` | Name → `@tenantscale/fastify`, deps → fastify |
| `packages/fastify/src/middleware.ts` | Adapt to Fastify's request/response model |
| `packages/fastify/src/error-handler.ts` | Fastify error handling pattern |
| `packages/fastify/src/types.ts` | Fastify-specific options |
| `packages/fastify/README.md` | Fastify-specific usage examples |
| `vitest.workspace.ts` | Add the new package path |
| Root `turbo.json` | Add lint/test/build pipelines |

### Adapter contract

Every adapter must expose these middleware/handlers:

| Middleware | Purpose |
|-----------|---------|
| `authenticateApiKey({ ts })` | Validates API key from request header |
| `requireScope({ ts }, ...scopes)` | Scope guard (after auth) |
| `requirePortalSession({ ts })` | Validates portal JWT session |
| `requirePortalRole({ ts }, ...roles)` | Role guard (after session) |
| `requireSuperAdmin({ ts })` | Super admin guard |
| `requirePlanLimit({ ts }, feature, count)` | Plan limit enforcement |
| `rateLimitByApiKey({ ts })` | Daily rate limiting by API key |
| `rateLimitByIp({ ts })` | IP-based creation throttling |
| `auditLog({ ts }, config)` | Audit event logging |
| `errorHandler({ ts })` | Maps errors → HTTP responses |

### Tests required

- ✅ Happy path: auth succeeds, key scopes match
- ✅ Missing/invalid auth header → 401
- ✅ Scope mismatch → 403
- ✅ Plan limit exceeded → 403
- ✅ Rate limit exceeded → 429
- ✅ Error handler maps SDK errors correctly
- ✅ At least 10 tests minimum

### Real example

Look at `packages/hono/src/middleware.ts` for a complete adapter reference. The Express adapter (`packages/express/src/middleware.ts`) is also a good reference with a slightly different request model.

---

## Pull Request Process

### Before you open

- [ ] All tests pass locally (`pnpm test`)
- [ ] `pnpm format:check` passes (no formatting issues)
- [ ] `pnpm build` completes without errors
- [ ] `pnpm lint` reports zero issues
- [ ] New code has corresponding tests
- [ ] Changed public API is documented in README
- [ ] PR description explains _what_ and _why_ (template provided)

### CI checks

When you open a PR, CI automatically runs:

1. **Format check** — Prettier formatting (`pnpm format:check`)
2. **Lint** — ESLint across all packages
3. **Build** — TypeScript compilation for all packages
4. **Test** — Full test suite with coverage
5. **DCO** — Every commit must have a `Signed-off-by` trailer

All must pass before merge. If a check fails, check the Actions tab for details.

### Merge

PRs are **squash merged** into `main`. The squash commit title becomes the changelog entry, so make sure it's descriptive.

---

## Code Style & Quality

| Rule | Standard |
|------|----------|
| **Language** | TypeScript with strict mode |
| **Formatting** | Prettier (run `pnpm format` before committing) |
| **Linting** | ESLint — package-scoped configs |
| **Testing** | Vitest — tests alongside source in `__tests__/` |
| **Coverage** | Aim for 90%+ on new code |
| **Logging** | Use the SDK's logger (`options.ts.logger`), never `console.log` |
| **Errors** | Use SDK error classes, never raw `throw new Error()` |
| **Async** | Always `await` or explicitly `.catch()` — no unhandled promises |
| **Imports** | Use `.js` extensions in source files (ESM convention) |

### Git Hooks

Husky runs these automatically:
- **pre-commit**: lint-staged (format + lint changed files)
- **commit-msg**: commitlint (validate conventional commit format)

If a hook blocks your commit, fix the issue rather than skipping with `--no-verify`.

---

## Contributor Recognition

We use [All Contributors](https://allcontributors.org) to recognize every contributor. When your PR merges, a bot will automatically add you to the README contributors table.

Contribution types we recognize:

| Emoji | Type |
|-------|------|
| 🐛 | Bug reports |
| 💻 | Code |
| 📖 | Documentation |
| 🚇 | Infra (CI, tooling) |
| 🤔 | Ideas & planning |
| 👀 | Reviewing PRs |
| 🌍 | Translation |
| 💡 | Examples |

---

## Getting Help

- **Discord:** [Join the server](https://discord.gg/tenantscale) — best for quick questions
- **GitHub Discussions:** [Start a discussion](https://github.com/TenantScale/sdk/discussions) — best for longer conversations
- **Issues:** Open an issue for bugs or feature requests
- **Maintainers:** Tag `@TenantScale/maintainers` in your PR for review

### Issue & PR Triage

| Label | Meaning |
|-------|---------|
| `good first issue` | Perfect for first-time contributors |
| `help wanted` | Maintainers would love help with this |
| `needs reproduction` | Bug needs a minimal reproduction |
| `blocked` | Waiting on something else |
| `design needed` | Needs discussion before implementation |

---

*Thank you for contributing to TenantScale! 🚀*
