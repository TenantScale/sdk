# @tenantscale/cli

**Scaffold multi-tenant SaaS projects with TenantScale.** Generate tenant-scoped middleware, migrations, and configuration for your framework of choice.

## Install

```bash
npm install -g @tenantscale/cli
# or
pnpm add -g @tenantscale/cli
```

## Usage

```bash
# Add TenantScale to an existing project
tenantscale init

# Generate migration artifacts
tenantscale migrate

# Show help
tenantscale --help
```

### tenantscale init

Interactive setup wizard that:
1. Detects your framework (Express, Hono, Next.js)
2. Installs the correct adapter package
3. Generates tenant-scoped middleware
4. Creates database migration files

```bash
tenantscale init --framework hono
tenantscale init --framework express --table organizations
```

### tenantscale migrate

Generate migration SQL and middleware for existing projects:

```bash
tenantscale migrate
```

## Features

- 🔍 Auto-detects Express, Hono, and Next.js
- 🎯 Generates framework-specific middleware
- 🗄️ Creates Supabase migration files
- 🔧 Non-interactive mode for CI/dev containers
