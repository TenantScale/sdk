// ──────────────────────────────────────────────────────
// @tenantscale/mcp — Tool handler tests
// ──────────────────────────────────────────────────────
import { describe, expect, it } from 'vitest'

import { callTenantScaleTool } from '../tools'

async function callToolText(name: string, args: Record<string, unknown>) {
  const result = await callTenantScaleTool(name, args)
  return result.content.map(item => item.text).join('\n')
}

describe('@tenantscale/mcp tool handlers', () => {
  it('returns the default tenant schema', async () => {
    const text = await callToolText('get_tenant_schema', {})

    expect(text).toContain('tenants')
    expect(text).toContain('tenant_users')
    expect(text).toContain('tenant_id')
  })

  it('preserves unicode table names in schema output', async () => {
    const text = await callToolText('get_tenant_schema', { table: '請求書' })

    expect(text).toContain('請求書')
  })

  it('marks tenant-scoped SELECT queries as safe', async () => {
    const text = await callToolText('validate_tenant_query', {
      query: "SELECT * FROM invoices WHERE tenant_id = 'tenant_123'",
      table: 'invoices',
    })

    expect(text).toContain('✅')
    expect(text).toContain('tenant_id')
  })

  it('warns when SELECT queries miss tenant scope', async () => {
    const text = await callToolText('validate_tenant_query', {
      query: 'SELECT * FROM invoices',
      table: 'invoices',
    })

    expect(text).toContain('⚠️')
    expect(text).toContain('tenant_id')
  })

  it('handles malformed SQL without marking it safe', async () => {
    const text = await callToolText('validate_tenant_query', {
      query: 'SELCT from',
      table: 'invoices',
    })

    expect(text).toContain('⚠️')
    expect(text).toContain('tenant_id')
  })

  it('rejects empty table names for query validation', async () => {
    const text = await callToolText('validate_tenant_query', {
      query: 'SELECT * FROM invoices',
      table: '   ',
    })

    expect(text).toContain('table is required')
  })

  it('generates RLS policy SQL for a table', async () => {
    const text = await callToolText('generate_rls_policy', { table: 'invoices' })

    expect(text).toContain('ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY')
    expect(text).toContain('CREATE POLICY')
    expect(text).toContain('tenant_id')
  })

  it('rejects empty table names for policy generation', async () => {
    const text = await callToolText('generate_rls_policy', { table: '   ' })

    expect(text).toContain('table is required')
  })

  it('suggests REST endpoints for a feature', async () => {
    const text = await callToolText('suggest_endpoint_structure', {
      feature: 'billing',
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    })

    expect(text).toContain('/v1/billing')
    expect(text).toContain('GET')
    expect(text).toContain('POST')
    expect(text).toContain('PATCH')
    expect(text).toContain('DELETE')
  })

  it('preserves unicode feature names in endpoint suggestions', async () => {
    const text = await callToolText('suggest_endpoint_structure', { feature: '請求' })

    expect(text).toContain('請求')
  })

  it('rejects empty feature names', async () => {
    const text = await callToolText('suggest_endpoint_structure', { feature: '' })

    expect(text).toContain('feature is required')
  })
})
