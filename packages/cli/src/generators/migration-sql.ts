// ──────────────────────────────────────────────────────
// @tenantscale/cli — Migration SQL Generator
// ──────────────────────────────────────────────────────

import type { TableInfo, DatabaseInfo } from '../analyzers/database.js'

export interface MigrationSqlResult {
  /** Files generated with their content */
  files: { path: string; content: string; description: string }[]
}

/**
 * Generate SQL migration files for adding tenant isolation.
 */
export function generateMigrationSql(
  database: DatabaseInfo,
  outputDir: string,
): MigrationSqlResult {
  const files: MigrationSqlResult['files'] = []
  const tables = database.tenantTables.filter((t) => !t.hasTenantId)

  if (tables.length === 0) {
    // Generate a placeholder migration showing how to add more tables
    files.push({
      path: `${outputDir}/001_add_tenant_id.sql`,
      content: `-- TenantScale: No tables need tenant_id migration
-- All detected tables already have tenant isolation.
--
-- If you need to add tenant_id to additional tables in the future:
--   ALTER TABLE your_table ADD COLUMN tenant_id UUID REFERENCES tenants(id);
--   CREATE INDEX idx_your_table_tenant_id ON your_table(tenant_id);
--   ALTER TABLE your_table ENABLE ROW LEVEL SECURITY;
`,
      description: 'Migration SQL (no changes needed)',
    })
    return { files }
  }

  // ── Migration 1: Add tenant_id columns ──
  const addContent = generateAddColumnSql(tables)
  files.push({
    path: `${outputDir}/001_add_tenant_id.sql`,
    content: addContent,
    description: `Add tenant_id to ${tables.length} table(s)`,
  })

  // ── Migration 2: RLS Policies ──
  const rlsContent = generateRlsPolicies(tables)
  files.push({
    path: `${outputDir}/002_rls_policies.sql`,
    content: rlsContent,
    description: 'Row-Level Security policies',
  })

  // ── Migration 3: Seed plans (reference) ──
  files.push({
    path: `${outputDir}/003_seed_plans.sql`,
    content: generateSeedPlans(),
    description: 'Seed plan tiers (Free/Hobby/Pro/Scale/Enterprise)',
  })

  return { files }
}

function generateAddColumnSql(tables: TableInfo[]): string {
  let sql = `-- TenantScale Migration: Add tenant isolation
-- Generated for ${tables.length} table(s)
-- Apply with: npx supabase db push

-- ============================================================
-- Step 1: Create tenants table (if it doesn't exist)
-- ============================================================
create table if not exists tenants (
  id          uuid default gen_random_uuid() primary key,
  name        text not null,
  slug        text unique not null,
  plan_id     text not null default 'free',
  features    jsonb not null default '{}',
  config      jsonb not null default '{}',
  settings    jsonb not null default '{}',
  is_active   boolean not null default true,
  metadata    jsonb default '{}',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ============================================================
-- Step 2: Add tenant_id to existing tables
-- ============================================================

`

  for (const table of tables) {
    sql += `-- Table: ${table.name}
alter table ${table.name} add column if not exists tenant_id uuid references tenants(id);
create index if not exists idx_${table.name}_tenant_id on ${table.name}(tenant_id);

`
  }

  sql += `-- ============================================================
-- Step 3: Enable Row Level Security on tenant tables
-- ============================================================

`

  for (const table of tables) {
    sql += `alter table ${table.name} enable row level security;

`
  }

  sql += `-- ============================================================
-- Note: After backfilling data, make tenant_id NOT NULL
-- ============================================================
-- ALTER TABLE ${tables[0]?.name ?? 'your_table'} ALTER COLUMN tenant_id SET NOT NULL;
`

  return sql
}

function generateRlsPolicies(tables: TableInfo[]): string {
  let sql = `-- TenantScale Migration: Row-Level Security Policies
-- Generated for ${tables.length} table(s)
--
-- These policies ensure users can only access data belonging
-- to their tenant. Requires Supabase Auth to be configured.

`

  for (const table of tables) {
    sql += `-- ============================================================
-- Policies for: ${table.name}
-- ============================================================

-- SELECT: users see only their own tenant's rows
create policy "${table.name}_tenant_select" on ${table.name}
  for select using (
    tenant_id in (
      select tenant_id from tenant_users
      where user_id = auth.uid()
    )
  );

-- INSERT: rows are created for the user's tenant
create policy "${table.name}_tenant_insert" on ${table.name}
  for insert with check (
    tenant_id in (
      select tenant_id from tenant_users
      where user_id = auth.uid()
    )
  );

-- UPDATE: users update only their own tenant's rows
create policy "${table.name}_tenant_update" on ${table.name}
  for update using (
    tenant_id in (
      select tenant_id from tenant_users
      where user_id = auth.uid()
    )
  );

-- DELETE: users delete only their own tenant's rows
create policy "${table.name}_tenant_delete" on ${table.name}
  for delete using (
    tenant_id in (
      select tenant_id from tenant_users
      where user_id = auth.uid()
    )
  );

`
  }

  return sql
}

function generateSeedPlans(): string {
  return `-- TenantScale: Seed subscription plan tiers
-- Run this to set up the default plan hierarchy.
-- Plans control API call limits, feature access, and pricing.

insert into plans (id, name, description, price_monthly, features, max_users, max_tenants, api_calls_per_day, sort_order) values
  ('free', 'Free', 'For side projects and prototypes', 0,
    '{"audit_log_retention_days": 7, "sso": false, "custom_domain": false, "team_members": 2, "webhooks": false, "api_access": true, "admin_dashboard": true}',
    2, 3, 1000, 1),
  ('hobby', 'Hobby', 'For early-stage SaaS with your first paying customers', 2900,
    '{"audit_log_retention_days": 30, "sso": false, "custom_domain": false, "team_members": 10, "webhooks": true, "api_access": true, "admin_dashboard": true}',
    10, 15, 10000, 2),
  ('pro', 'Pro', 'For growing B2B products that need audit trails and support', 9900,
    '{"audit_log_retention_days": 90, "sso": false, "custom_domain": false, "team_members": 100, "webhooks": true, "api_access": true, "admin_dashboard": true}',
    100, 100, 100000, 3),
  ('scale', 'Scale', 'For mid-market teams needing SSO, long retention, and priority support', 24900,
    '{"audit_log_retention_days": 365, "sso": false, "custom_domain": false, "team_members": 500, "webhooks": true, "api_access": true, "admin_dashboard": true}',
    500, 500, 500000, 4),
  ('enterprise', 'Enterprise', 'For large organizations with dedicated infrastructure and compliance', 0,
    '{"audit_log_retention_days": 3650, "sso": true, "custom_domain": true, "team_members": null, "webhooks": true, "api_access": true, "admin_dashboard": true}',
    null, null, null, 5)
on conflict (id) do nothing;
`
}
