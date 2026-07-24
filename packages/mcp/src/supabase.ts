/*
 * MIT License
 *
 * Copyright (c) 2026 TenantScale
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

// ──────────────────────────────────────────────────────
// @tenantscale/mcp — Supabase client & schema introspection
// ──────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
  default: string | null
}

export interface TableInfo {
  table_name: string
  table_schema: string
  columns: ColumnInfo[]
  rls_enabled: boolean
  rls_policies: Array<{ policy_name: string; definition: string }>
  row_count: number | null
}

// ── Connection ──

let _client: SupabaseClient | null = null

function getClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null

  if (!_client) {
    _client = createClient(url, key, {
      auth: { persistSession: false },
    })
  }
  return _client
}

// ── Schema Introspection ──

/**
 * Query information_schema via the Supabase pgREST API directly.
 * Falls back gracefully if the schema endpoint isn't accessible.
 */
async function queryInfoSchema<T>(
  supabaseUrl: string,
  supabaseKey: string,
  view: string,
  select: string,
  filter?: string,
): Promise<T[]> {
  const url = new URL(`${supabaseUrl}/rest/v1/${view}`)
  url.searchParams.set('select', select)
  if (filter) url.searchParams.set(filter.split('=')[0], filter.split('=').slice(1).join('='))

  const res = await fetch(url.toString(), {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Accept: 'application/json',
    },
  })

  if (!res.ok) {
    throw new Error(
      `pgREST query failed (${res.status}): ${await res.text().catch(() => 'unknown')}`,
    )
  }

  return res.json() as Promise<T[]>
}

/**
 * Fetch all tables that have a `tenant_id` column, their columns, and RLS status.
 */
export async function fetchTenantTables(): Promise<TableInfo[]> {
  const client = getClient()
  if (!client) return []

  const supabaseUrl = process.env.SUPABASE_URL!
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  // Find all tables with a tenant_id column
  const tablesWithTenantId = await queryInfoSchema<{
    table_name: string
    table_schema: string
  }>(
    supabaseUrl,
    supabaseKey,
    'information_schema.columns',
    'table_name,table_schema',
    'column_name=tenant_id',
  )

  if (tablesWithTenantId.length === 0) return []

  const schemaNames = [...new Set(tablesWithTenantId.map((t) => t.table_schema))]
    .map((s) => `'${s}'`)
    .join(',')
  const tableNames = tablesWithTenantId.map((t) => `'${t.table_name}'`).join(',')

  // Fetch columns for all matched tables
  const allColumns = await queryInfoSchema<{
    table_name: string
    table_schema: string
    column_name: string
    data_type: string
    is_nullable: string
    column_default: string | null
  }>(
    supabaseUrl,
    supabaseKey,
    'information_schema.columns',
    'table_name,table_schema,column_name,data_type,is_nullable,column_default',
    `table_name=in.(${tableNames})`,
  )

  // Fetch RLS info from pg_policies (only accessible as superuser/service_role)
  let policies: Array<{
    tablename: string
    policyname: string
    qual: string | null
    schemaname: string
  }> = []
  try {
    policies = await queryInfoSchema(
      supabaseUrl,
      supabaseKey,
      'pg_policies',
      'tablename,policyname,qual,schemaname',
      `schemaname=in.(${schemaNames})`,
    )
  } catch {
    // pg_policies might not be exposed; that's fine
  }

  // Get row counts via the REST API Aggregate header
  async function getRowCount(table: string): Promise<number | null> {
    try {
      const url = new URL(`${supabaseUrl}/rest/v1/${table}`)
      url.searchParams.set('select', 'count')
      const res = await fetch(url.toString(), {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          Accept: 'application/json',
          Prefer: 'count=estimated',
        },
      })
      if (res.ok) {
        const count = parseInt(res.headers.get('content-range')?.split('/')[1] ?? '', 10)
        return isNaN(count) ? null : count
      }
      return null
    } catch {
      return null
    }
  }

  // Assemble the results
  const result: TableInfo[] = []
  for (const table of tablesWithTenantId) {
    const cols = allColumns
      .filter((c) => c.table_name === table.table_name && c.table_schema === table.table_schema)
      .map((c) => ({
        name: c.column_name,
        type: c.data_type,
        nullable: c.is_nullable === 'YES',
        default: c.column_default,
      }))

    const tablePolicies = policies.filter(
      (p) => p.tablename === table.table_name && p.schemaname === table.table_schema,
    )

    result.push({
      table_name: table.table_name,
      table_schema: table.table_schema,
      columns: cols,
      rls_enabled: tablePolicies.length > 0,
      rls_policies: tablePolicies.map((p) => ({
        policy_name: p.policyname,
        definition: p.qual ?? 'USING (true)',
      })),
      row_count: await getRowCount(table.table_name),
    })
  }

  return result
}

/**
 * Fetch schema info for a single table, or null if the table doesn't have a tenant_id column.
 */
export async function fetchTableSchema(table: string): Promise<TableInfo | null> {
  const client = getClient()
  if (!client) return null

  const supabaseUrl = process.env.SUPABASE_URL!
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  // Check if the table has a tenant_id column
  const tablesWithTenantId = await queryInfoSchema<{
    table_name: string
    table_schema: string
  }>(
    supabaseUrl,
    supabaseKey,
    'information_schema.columns',
    'table_name,table_schema',
    `column_name=tenant_id&table_name=eq.${table}`,
  )

  if (tablesWithTenantId.length === 0) return null

  const t = tablesWithTenantId[0]

  // Fetch columns
  const columns = await queryInfoSchema<{
    column_name: string
    data_type: string
    is_nullable: string
    column_default: string | null
  }>(
    supabaseUrl,
    supabaseKey,
    'information_schema.columns',
    'column_name,data_type,is_nullable,column_default',
    `table_name=eq.${table}`,
  )

  // Fetch RLS
  let policies: Array<{ policyname: string; qual: string | null }> = []
  try {
    policies = await queryInfoSchema(
      supabaseUrl,
      supabaseKey,
      'pg_policies',
      'policyname,qual',
      `tablename=eq.${table}`,
    )
  } catch {
    // fine
  }

  let rowCount: number | null = null
  try {
    const url = new URL(`${supabaseUrl}/rest/v1/${table}`)
    url.searchParams.set('select', 'count')
    const res = await fetch(url.toString(), {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Accept: 'application/json',
        Prefer: 'count=estimated',
      },
    })
    if (res.ok) {
      const count = parseInt(res.headers.get('content-range')?.split('/')[1] ?? '', 10)
      rowCount = isNaN(count) ? null : count
    }
  } catch {
    // fine
  }

  return {
    table_name: t.table_name,
    table_schema: t.table_schema,
    columns: columns.map((c) => ({
      name: c.column_name,
      type: c.data_type,
      nullable: c.is_nullable === 'YES',
      default: c.column_default,
    })),
    rls_enabled: policies.length > 0,
    rls_policies: policies.map((p) => ({
      policy_name: p.policyname,
      definition: p.qual ?? 'USING (true)',
    })),
    row_count: rowCount,
  }
}
