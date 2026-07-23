// ──────────────────────────────────────────────────────
// @tenantscale/mcp — MCP Server
// Gives AI coding tools (Claude, Cursor, Copilot)
// real-time tenant schema, RLS validation, and
// endpoint structure during development.
// ──────────────────────────────────────────────────────

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { TOOLS, callTenantScaleTool } from './tools.js'

// ── Server Setup ──

const server = new Server(
  { name: '@tenantscale/mcp', version: '0.1.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  return callTenantScaleTool(name, args ?? {})
})

// ── Start ──

const transport = new StdioServerTransport()
try {
  await server.connect(transport)
  console.error('@tenantscale/mcp running on stdio')
} catch (err) {
  console.error('[TenantScale] MCP server failed to start:', err)
  process.exit(1)
}
