-- ════════════════════════════════════════════════════════════
-- TenantScale RLS Policies — Row-Level Security for Supabase
-- ════════════════════════════════════════════════════════════
-- These policies ensure data is isolated between tenants.
-- Apply via Supabase dashboard or `supabase db push`.

-- Helper: extract tenant_id from API key JWT
create or replace function tenant_id()
returns text
language sql stable
as $$
  select current_setting('request.jwt.claims', true)::json->>'tenant_id';
$$;

-- Helper: extract user role from session
create or replace function user_role()
returns text
language sql stable
as $$
  select current_setting('request.jwt.claims', true)::json->>'role';
$$;

-- Example RLS policy for a tenants table
create policy "Users can only access their own tenant"
  on tenants
  for all
  using (id = tenant_id());

-- Example RLS policy for tenant-scoped data
create policy "Data is isolated by tenant_id"
  on your_table_name
  for all
  using (tenant_id = tenant_id());

-- Admin override (users with admin role can see all)
create policy "Admins can access all data"
  on your_table_name
  for all
  using (user_role() = 'admin');
