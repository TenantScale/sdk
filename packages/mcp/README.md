# @tenantscale/mcp

**MCP server for TenantScale** — gives AI coding tools (Claude, Cursor, Copilot) real-time tenant schema, RLS validation, and endpoint structure during development.

## Install

```bash
npm install @tenantscale/mcp
# or
pnpm add @tenantscale/mcp
```

## Quick Start

```bash
# Start the MCP server
npx @tenantscale/mcp
```

Configure your AI coding tool to connect to the MCP server:

### Claude Desktop / Claude Code

Add to `claude.json` or `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "tenantscale": {
      "command": "npx",
      "args": ["@tenantscale/mcp"]
    }
  }
}
```

## Tools

| Tool | Purpose |
|------|---------|
| `get_tenant_schema` | Look up tenant table structures and columns |
| `validate_tenant_query` | Check if a SQL query is properly tenant-scoped |
| `generate_rls_policy` | Generate RLS policies for new tables |
| `suggest_endpoint_structure` | Recommend route patterns following TenantScale conventions |

## Development

```bash
pnpm dev    # Start with tsx watch
pnpm build  # Compile TypeScript
pnpm test   # Run tests
```
