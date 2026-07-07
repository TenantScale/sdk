# create-tenantscale-app

**Scaffold a full-stack multi-tenant SaaS app** with Next.js, Hono, and TenantScale — in minutes.

## Usage

```bash
# Using npm
npm create tenantscale-app@latest

# Using pnpm
pnpm create tenantscale-app

# Using npx
npx create-tenantscale-app
```

Then follow the interactive prompts to choose your framework and features.

## What You Get

A complete multi-tenant SaaS starter with:

- 🏢 Tenant isolation via Supabase RLS
- 🔑 API key authentication
- 📋 Audit logging
- 💳 Stripe billing integration
- 🚦 Rate limiting
- 🔐 User authentication with Supabase Auth

## Options

```bash
# Specify a project directory
pnpm create tenantscale-app my-app

# Use a specific framework
pnpm create tenantscale-app --framework hono

# Non-interactive mode
pnpm create tenantscale-app my-app --framework next --table organizations
```
