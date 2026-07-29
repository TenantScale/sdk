# {{projectName}}

**Multi-tenant B2B SaaS app** built with Next.js, Hono, and TenantScale.

## Setup

```bash
cp .env.example .env.local   # Add your Supabase credentials
pnpm install
pnpm dev
```

## Structure

```
apps/
├── web/        # Next.js frontend (App Router + shadcn/ui + TenantScale React)
└── api/        # Hono API server (TenantScale SDK + Supabase)
```

## Deploy

- **Frontend**: `cd apps/web && vercel deploy`
- **API**: `cd apps/api && vercel deploy`
