# AGENTS.md

Guidance for AI coding agents working in this repository.

## Repository overview

- Monorepo managed with **pnpm workspaces** and **Turborepo**.
- Core package: `packages/sdk` (`@tenantscale/sdk`).
- Framework adapters: `packages/express`, `packages/hono`, `packages/next`, `packages/fastify`, `packages/koa`.
- Supporting packages: `packages/react`, `packages/drizzle`, `packages/cli`, `packages/create-app`, `packages/mcp`.

## Environment and setup

- Node.js `>=22`, **Node 24 recommended for development** (see `.nvmrc`).
- Package manager: `pnpm@9.15.0`.
- Install dependencies from repo root:
  - `pnpm install`

## Common commands (run from repo root)

- `pnpm build` — build all packages.
- `pnpm test` — run all tests.
- `pnpm lint` — lint all packages.
- `pnpm format:check` — check formatting.
- `pnpm format` — format TypeScript source files.

Use package filtering to scope work:

- `pnpm --filter @tenantscale/sdk test`
- `pnpm --filter @tenantscale/hono build`

## Codebase conventions

- Language: TypeScript (ESM style in source).
- Keep changes focused and minimal.
- Add or update tests for behavior changes.
- Prefer existing SDK error classes and patterns over introducing new styles.
- Avoid `console.log` in production code.

## Testing guidance

- Run targeted tests for changed packages first.
- Run full `pnpm test` for cross-package or shared behavior changes.
- For release-sensitive or API-surface changes, also run:
  - `pnpm build`
  - `pnpm lint`
  - `pnpm format:check`

## Security and safety

- Never commit secrets or credentials.
- Keep SSRF-related safeguards intact (`packages/sdk/src/ssrf.ts`).
- Preserve tenant-isolation assumptions across adapters and core SDK behavior.

## Contribution hygiene

- Follow Conventional Commits for commit messages.
- Keep public API/documentation aligned when behavior changes.
- Respect existing project docs: `README.md`, `CONTRIBUTING.md`, `SECURITY.md`.
