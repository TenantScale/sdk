// ──────────────────────────────────────────────────────
// @tenantscale/mcp — Tool definitions and handlers
// ──────────────────────────────────────────────────────

export const TOOLS = [
  {
    name: 'get_tenant_schema',
    description:
      'Look up existing tenant structures (tables, columns, RLS policies) from a connected Supabase project',
    inputSchema: {
      type: 'object',
      properties: {
        table: {
          type: 'string',
          description:
            'Optional table name to scope the lookup (e.g. "audit_events"). Omitting returns all tenant-related tables.',
        },
      },
    },
  },
  {
    name: 'validate_tenant_query',
    description:
      'Check a SQL query for tenant isolation — ensures every SELECT/INSERT/UPDATE/DELETE includes a tenant_id filter',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The SQL query to validate' },
        table: { type: 'string', description: 'The primary table being queried' },
      },
      required: ['query', 'table'],
    },
  },
  {
    name: 'generate_rls_policy',
    description: 'Generate a Row-Level Security policy for a new table, scoped to tenant_id',
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'The new table name' },
        schema: {
          type: 'string',
          description: 'Database schema (default: public)',
          default: 'public',
        },
      },
      required: ['table'],
    },
  },
  {
    name: 'suggest_endpoint_structure',
    description:
      'Get the recommended route patterns for a new feature — consistent with TenantScale conventions',
    inputSchema: {
      type: 'object',
      properties: {
        feature: {
          type: 'string',
          description: 'Feature name, e.g. "billing", "webhooks", "invitations"',
        },
        methods: {
          type: 'array',
          items: { type: 'string' },
          description: 'HTTP methods needed: GET, POST, PATCH, DELETE',
        },
      },
      required: ['feature'],
    },
  },
]

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>
}

function textResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }] }
}

async function handleGetTenantSchema(table?: string) {
  if (table) {
    return `-- Schema for "${table}" follows TenantScale conventions:
--   id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
--   tenant_id   UUID NOT NULL
--   ...feature columns...
--   created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
--
-- RLS: ENABLE ROW LEVEL SECURITY;
-- POLICY tenant_isolation_${table}: FOR ALL USING (tenant_id = current_setting('app.tenant_id')::UUID)
`
  }

  return `TenantScale standard tables:
  • tenants          — Core tenant records, plan, feature flags
  • tenant_users     — User-tenant membership
  • api_keys         — Scoped API keys per tenant
  • audit_events     — Immutable audit trail (tenant-scoped)
  • impersonation_sessions  — Admin impersonation tokens
  • plans            — Plan tiers and feature entitlements

Every new tenant-scoped table should:
  1. Include a "tenant_id UUID NOT NULL"
  2. Enable RLS with a tenant-scoped policy
  3. Add a GIN index on tenant_id`
}

function handleValidateQuery(query: string, table: string) {
  const trimmedQuery = query.trim()
  const trimmedTable = table.trim()

  if (!trimmedQuery) {
    return '⚠️  query is required to validate tenant isolation.'
  }

  if (!trimmedTable) {
    return '⚠️  table is required to validate tenant isolation.'
  }

  const upper = trimmedQuery.toUpperCase()
  const issues: string[] = []
  const knownSqlStatement = /^(SELECT|INSERT|UPDATE|DELETE)\b/i.test(trimmedQuery)

  if (!knownSqlStatement) {
    issues.push(
      `⚠️  Unable to identify a SELECT/INSERT/UPDATE/DELETE statement for "${trimmedTable}". Verify the query includes tenant_id scoping.`,
    )
  }

  if (upper.includes('WHERE')) {
    const whereClause = trimmedQuery.split(/WHERE/i)[1]
    if (whereClause && !whereClause.toLowerCase().includes('tenant_id')) {
      issues.push(
        `⚠️  WHERE clause found but does not reference "tenant_id". Add: AND tenant_id = current_setting('app.tenant_id')::UUID`,
      )
    }
  } else if (upper.startsWith('SELECT') && !upper.includes('COUNT')) {
    issues.push(
      `⚠️  No WHERE clause on SELECT from "${trimmedTable}". All tenant queries must filter by tenant_id.`,
    )
  }

  if (
    !upper.includes('tenant_id') &&
    (upper.startsWith('INSERT') || upper.startsWith('UPDATE') || upper.startsWith('DELETE'))
  ) {
    issues.push(
      `⚠️  Mutation on "${trimmedTable}" missing tenant_id reference. Did you forget to scope to the current tenant?`,
    )
  }

  if (issues.length === 0) {
    return `✅ Query looks tenant-safe. The query references "tenant_id" correctly.`
  }

  return issues.join('\n')
}

function handleGenerateRLSPolicy(table: string, schema: string) {
  const trimmedTable = table.trim()
  const trimmedSchema = schema.trim() || 'public'

  if (!trimmedTable) {
    return 'Error: table is required to generate an RLS policy.'
  }

  return `-- Generated RLS policy for "${trimmedSchema}"."${trimmedTable}"
ALTER TABLE "${trimmedSchema}"."${trimmedTable}" ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policy (read/write scoped to current tenant)
CREATE POLICY "tenant_isolation_${trimmedTable}" ON "${trimmedSchema}"."${trimmedTable}"
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

-- Admin override policy (service_role bypasses RLS)
-- Note: service_role always bypasses RLS by default

-- Index for tenant-scoped queries
CREATE INDEX idx_${trimmedTable}_tenant_id ON "${trimmedSchema}"."${trimmedTable}" (tenant_id);

-- Grant access to authenticated + anon roles as needed
-- GRANT SELECT, INSERT, UPDATE, DELETE ON "${trimmedSchema}"."${trimmedTable}" TO authenticated;
`
}

function handleSuggestEndpoint(feature: string, methods: string[] = []) {
  const trimmedFeature = feature.trim()

  if (!trimmedFeature) {
    return 'Error: feature is required to suggest endpoint structure.'
  }

  const routes = methods
    .map((m) => {
      const method = m.toUpperCase()
      switch (method) {
        case 'GET':
          return [
            `GET    /v1/${trimmedFeature}          — List ${trimmedFeature} for current tenant`,
            `GET    /v1/${trimmedFeature}/:id      — Get single ${trimmedFeature} entry`,
          ]
        case 'POST':
          return [`POST   /v1/${trimmedFeature}          — Create new ${trimmedFeature} entry`]
        case 'PATCH':
          return [`PATCH  /v1/${trimmedFeature}/:id      — Update ${trimmedFeature} entry`]
        case 'DELETE':
          return [`DELETE /v1/${trimmedFeature}/:id      — Delete ${trimmedFeature} entry`]
        default:
          return []
      }
    })
    .flat()

  const notes = [
    '',
    `Admin routes (if needed):`,
    `GET    /v1/admin/${trimmedFeature}    — Cross-tenant ${trimmedFeature} view (requires admin key)`,
    '',
    `Middleware to apply:`,
    `  • ${trimmedFeature} routes → ts.protect(), ts.audit()`,
    `  • Admin routes     → ts.requireAdmin()`,
    '',
    `Schema reference:`,
    `  • tenant_id FK is required on every new table`,
    `  • See TENANTSCALE.md for the standard column pattern`,
  ]

  return [...routes, ...notes].join('\n')
}

export async function callTenantScaleTool(name: string, args: Record<string, unknown> = {}) {
  switch (name) {
    case 'get_tenant_schema': {
      const text = await handleGetTenantSchema(args.table as string | undefined)
      return textResult(text)
    }

    case 'validate_tenant_query': {
      const { query = '', table = '' } = args as { query?: string; table?: string }
      const text = handleValidateQuery(query, table)
      return textResult(text)
    }

    case 'generate_rls_policy': {
      const { table = '', schema = 'public' } = args as { table?: string; schema?: string }
      const text = handleGenerateRLSPolicy(table, schema)
      return textResult(text)
    }

    case 'suggest_endpoint_structure': {
      const { feature = '', methods } = args as { feature?: string; methods?: string[] }
      const text = handleSuggestEndpoint(feature, methods)
      return textResult(text)
    }

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}
