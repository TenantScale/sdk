# create-tenantscale-app

**Scaffold a multi-tenant SaaS app** with TenantScale — in minutes.

## Usage

```bash
# Using npm
npm create tenantscale-app@latest

# Using pnpm
pnpm create tenantscale-app

# Using npx
npx create-tenantscale-app
```

Follow the interactive prompts to customize your project.

### Non-interactive mode

In CI or non-TTY environments, defaults are used automatically.
You can also pass a project name directly:

```bash
pnpm create tenantscale-app my-app
```

## Interactive Prompts

| Prompt | Options | Description |
|--------|---------|-------------|
| Project name | text | Validated alphanumeric + hyphens/underscores |
| Template tier | Minimal / Example / Full | How much starter code to include |
| Framework | Next.js + Hono (more coming) | Which stack to scaffold |
| Language | TypeScript / JavaScript | Source language for generated code |
| Package manager | pnpm / npm / yarn | Used for dependency install |
| Tenant column | `tenant_id` (default) or custom | Column name for tenant isolation |
| Supabase | Skip / Enter credentials | Pre-fill `.env.example` with your project |
| Stripe billing | Yes / No | Include billing integration (Example/Full tiers) |
| Git init | Yes / No | Initialize repo + initial commit |
| Install deps | Yes / No | Run package manager install |

## Templates

### Minimal
Bare scaffold with just the essentials:
- API server with Hono + TenantScale SDK
- Next.js web app shell
- Supabase client setup
- `.env.example` with required vars

### Example **(recommended)**
Full-featured starter with working routes:
- **API**: tenant management, API keys, team, audit, webhooks
- **Web**: dashboard, login, register, team management, audit log, API keys, settings
- **Supabase**: initialization migration with RLS policies
- **Components**: navigation, auth providers, utility functions

### Full Demo
Everything in Example, plus:
- **Stripe billing** — checkout sessions, customer portal, webhook handling
- **RLS policies** — helper functions and example policies for Supabase
- **Test file** — tenant isolation test template
- **Subscription management** pages

## Post-Scaffold Hooks

After scaffolding, the CLI can:
- Install dependencies with your chosen package manager
- Initialize a git repo with an initial commit
- Print framework-specific next steps

## Adding New Frameworks

Template infrastructure supports multiple frameworks.
To add one, create a new directory under each tier:

```
templates/
  minimal/
    next-hono/      # existing
    express/        # future
    fastify/        # future
  example/
    next-hono/      # existing
    ...
  full/
    next-hono/      # existing
    ...
```

Then add the framework to the `FRAMEWORKS` array in `src/prompts.ts`.

## Development

```bash
# Install dependencies (from repo root)
pnpm install

# Build
pnpm --filter @tenantscale/create-app build

# Test
pnpm --filter @tenantscale/create-app test

# Run locally
node packages/create-app/dist/index.js test-project
```

## What You Get

A complete multi-tenant SaaS starter with:

- 🏢 Tenant isolation via Supabase RLS
- 🔑 API key authentication
- 📋 Audit logging
- 💳 Stripe billing integration (optional)
- 🚦 Rate limiting
- 🔐 User authentication with Supabase Auth
