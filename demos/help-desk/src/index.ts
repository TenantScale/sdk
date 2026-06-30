// ════════════════════════════════════════════════════════
// TenantScale Demo: Multi-Tenant IT Help Desk for MSPs
// ════════════════════════════════════════════════════════
//
// This demo proves TenantScale's core value proposition:
//   "Add multi-tenancy to any SaaS app in minutes"
//
// It shows 5 TenantScale features in action:
//   1. tenant.protect()  — tenant isolation middleware
//   2. ts.getTenant()    — current tenant context
//   3. ts.getPlanLimit() — plan-based feature gating
//   4. ts.logAudit()     — audit trail
//   5. Query Guard       — prevents cross-tenant data leaks
//
// ════════════════════════════════════════════════════════

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { TenantScale } from '@tenantscale/sdk'
import { createTenantSafeClient } from '@tenantscale/sdk/middleware'
import { z } from 'zod'

// ── Demo Data Store (in-memory) ───────────────────────
// Each tenant has tickets that ONLY they can see.
// In production, this would be your database.

interface Ticket {
  id: string
  tenant_id: string
  title: string
  status: 'open' | 'in_progress' | 'resolved'
  priority: 'low' | 'medium' | 'high' | 'critical'
  requester: string
  created_at: string
}

// Demo tenants with their API keys (seeded by seed.ts)
interface DemoData {
  [apiKey: string]: {
    tenant_id: string
    tenant_name: string
    tenant_slug: string
    plan: string
    features: Record<string, unknown>
    tickets: Ticket[]
  }
}

const STORE: DemoData = {
  'demo_acme': {
    tenant_id: 'acme-corp-0001',
    tenant_name: 'Acme Corp',
    tenant_slug: 'acme-corp',
    plan: 'pro',
    features: {
      max_users: 100,
      max_tickets: 1000,
      audit_log_retention_days: 365,
      sso: true,
      priority_support: true,
      custom_fields: true,
    },
    tickets: [
      { id: 't1', tenant_id: 'acme-corp-0001', title: 'VPN not connecting for remote users', status: 'open', priority: 'high', requester: 'sarah@acme.com', created_at: '2026-06-25T09:00:00Z' },
      { id: 't2', tenant_id: 'acme-corp-0001', title: 'New employee onboarding — laptop setup', status: 'in_progress', priority: 'medium', requester: 'mike@acme.com', created_at: '2026-06-24T14:00:00Z' },
      { id: 't3', tenant_id: 'acme-corp-0001', title: 'Email migration to Office 365', status: 'resolved', priority: 'medium', requester: 'sarah@acme.com', created_at: '2026-06-20T11:00:00Z' },
    ],
  },
  'demo_globex': {
    tenant_id: 'globex-inc-0002',
    tenant_name: 'Globex Industries',
    tenant_slug: 'globex-inc',
    plan: 'free',
    features: {
      max_users: 5,
      max_tickets: 10,
      audit_log_retention_days: 1,
      sso: false,
      priority_support: false,
      custom_fields: false,
    },
    tickets: [
      { id: 't4', tenant_id: 'globex-inc-0002', title: 'WiFi password reset', status: 'open', priority: 'low', requester: 'bob@globex.com', created_at: '2026-06-26T08:00:00Z' },
      { id: 't5', tenant_id: 'globex-inc-0002', title: 'Printer not working on floor 3', status: 'open', priority: 'medium', requester: 'alice@globex.com', created_at: '2026-06-25T16:00:00Z' },
    ],
  },
  'demo_admin': {
    tenant_id: 'msp-admin-0000',
    tenant_name: 'MSP Admin Portal',
    tenant_slug: 'msp-admin',
    plan: 'scale',
    features: {
      max_users: 9999,
      max_tickets: 99999,
      audit_log_retention_days: 3650,
      sso: true,
      priority_support: true,
      custom_fields: true,
    },
    tickets: [
      { id: 't6', tenant_id: 'msp-admin-0000', title: 'Monitor all tenant activity', status: 'open', priority: 'medium', requester: 'admin@msp.com', created_at: '2026-06-26T07:00:00Z' },
    ],
  },
}

// ══════════════════════════════════════════════════════
// 1. TenantScale Initialization
//    One line. That's it.
// ══════════════════════════════════════════════════════

const ts = new TenantScale({
  baseUrl: 'http://localhost:3001',    // Point to your API
  apiKey: '',                           // Set per-request via middleware
})

const app = new Hono()

// ── Static assets ──
app.get('/static/*', async (c) => {
  // Inline SVG icons, etc.
  return c.notFound()
})

// ══════════════════════════════════════════════════════
// 2. Tenant Isolation Middleware
//    `ts.protect()` extracts the API key from the
//    Authorization header, resolves the tenant, and
//    attaches it to the request context.
//    Every route after this knows "who" the tenant is.
// ══════════════════════════════════════════════════════

// Custom demo protect — instead of calling TenantScale API,
// we resolve from our demo store so the demo is self-contained.
// In production, use `ts.protect()` which calls your API.
async function demoProtect(c: any, next: any) {
  // Check Authorization header first, then query param, then cookie
  let apiKey = ''
  const authHeader = c.req.header('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    apiKey = authHeader.slice(7)
  } else if (c.req.query('api_key')) {
    apiKey = c.req.query('api_key')
    // Set cookie so subsequent requests don't need the query param
    c.header('Set-Cookie', `api_key=${apiKey}; Path=/; HttpOnly; SameSite=Lax`)
  } else if (c.req.header('Cookie')?.match(/api_key=([^;]+)/)) {
    apiKey = c.req.header('Cookie')!.match(/api_key=([^;]+)/)![1]
  }
  if (!apiKey) {
    return c.html(loginPage('Please enter a demo API key'), 401)
  }
  const tenantData = STORE[apiKey]
  if (!tenantData) {
    return c.html(loginPage('Invalid API key. Use: demo_acme, demo_globex, or demo_admin'), 401)
  }

  // Set the tenant context — same shape as TenantScale's protect()
  c.set('tenant', {
    id: tenantData.tenant_id,
    name: tenantData.tenant_name,
    slug: tenantData.tenant_slug,
    plan: tenantData.plan,
    features: tenantData.features,
    config: {},
    settings: {},
  })
  c.set('apiKey', apiKey)
  await next()
}

// In production, it's just this:
//   app.use('/api/*', ts.protect())

// ══════════════════════════════════════════════════════
// 3. HTML Dashboard (server-rendered)
// ══════════════════════════════════════════════════════

app.get('/', demoProtect, async (c) => {
  const tenant: any = c.get('tenant')
  const apiKey: string = c.get('apiKey')
  const tenantData = STORE[apiKey]

  // ══════════════════════════════════════════════════
  // 4. Plan Limit Checking
  //    `ts.getPlanLimit()` reads the merged feature map
  //    (plan defaults + tenant overrides) from context.
  //    Check any usage against plan limits.
  // ══════════════════════════════════════════════════

  const maxTickets = ts.getPlanLimit(c as any, 'max_tickets') as number | null
  const hasPrioritySupport = ts.getPlanLimit(c as any, 'priority_support') as boolean
  const hasSSO = ts.getPlanLimit(c as any, 'sso') as boolean
  const currentTickets = tenantData.tickets.length
  const atLimit = maxTickets !== null && currentTickets >= maxTickets

  const openCount = tenantData.tickets.filter(t => t.status === 'open').length
  const inProgressCount = tenantData.tickets.filter(t => t.status === 'in_progress').length
  const resolvedCount = tenantData.tickets.filter(t => t.status === 'resolved').length

  return c.html(dashboardPage({
    tenantName: tenant.name,
    tenantSlug: tenant.slug,
    plan: tenant.plan,
    tickets: tenantData.tickets,
    openCount,
    inProgressCount,
    resolvedCount,
    maxTickets,
    currentTickets,
    atLimit,
    hasPrioritySupport,
    hasSSO,
    apiKey,
    isAdmin: apiKey === 'demo_admin',
  }))
})

// ══════════════════════════════════════════════════
// 5. Ticket CRUD (all tenant-scoped)
// ══════════════════════════════════════════════════

app.post('/tickets', demoProtect, async (c) => {
  const tenant: any = c.get('tenant')
  const apiKey: string = c.get('apiKey')
  const tenantData = STORE[apiKey]

  // Check plan limit before creating
  const maxTickets = ts.getPlanLimit(c as any, 'max_tickets') as number | null
  if (maxTickets !== null && tenantData.tickets.length >= maxTickets) {
    return c.json({ error: 'Ticket limit reached. Upgrade your plan to create more tickets.' }, 403)
  }

  const body: { title?: string; priority?: string; description?: string } = {}
  const contentType = c.req.header('Content-Type') || ''
  if (contentType.includes('application/json')) {
    Object.assign(body, await c.req.json())
  } else {
    const form = await c.req.parseBody()
    body.title = form.title as string
    body.priority = form.priority as string
  }
  if (!body.title?.trim()) {
    return c.json({ error: 'Title is required' }, 400)
  }

  const ticket: Ticket = {
    id: `t${Date.now()}`,
    tenant_id: tenant.id,
    title: body.title,
    status: 'open',
    priority: (body.priority as Ticket['priority']) ?? 'medium',
    requester: 'demo@example.com',
    created_at: new Date().toISOString(),
  }
  tenantData.tickets.push(ticket)

  // ══════════════════════════════════════════════════
  // 6. Audit Trail
  //    Every action is logged automatically.
  //    `ts.logAudit()` fires a non-blocking event.
  // ══════════════════════════════════════════════════

  await ts.logAudit(c as any, {
    action: 'ticket.created',
    resource: `ticket:${ticket.id}`,
    details: { title: ticket.title, priority: ticket.priority },
  })

  return c.json(ticket, 201)
})

app.patch('/tickets/:id', demoProtect, async (c) => {
  const tenant: any = c.get('tenant')
  const apiKey: string = c.get('apiKey')
  const tenantData = STORE[apiKey]
  const ticketId = c.req.param('id')
  
  const body: { status?: string; title?: string } = {}
  const contentType = c.req.header('Content-Type') || ''
  if (contentType.includes('application/json')) {
    Object.assign(body, await c.req.json())
  } else {
    const form = await c.req.parseBody()
    body.title = form.title as string
    body.status = form.status as string
  }

  const ticket = tenantData.tickets.find(t => t.id === ticketId)
  if (!ticket) return c.json({ error: 'Ticket not found' }, 404)

  if (body.status) ticket.status = body.status as Ticket['status']
  if (body.title) ticket.title = body.title

  await ts.logAudit(c as any, {
    action: 'ticket.updated',
    resource: `ticket:${ticket.id}`,
    details: body,
  })

  return c.json(ticket)
})

app.delete('/tickets/:id', demoProtect, async (c) => {
  const tenant: any = c.get('tenant')
  const apiKey: string = c.get('apiKey')
  const tenantData = STORE[apiKey]
  const ticketId = c.req.param('id')

  const idx = tenantData.tickets.findIndex(t => t.id === ticketId)
  if (idx === -1) return c.json({ error: 'Ticket not found' }, 404)

  tenantData.tickets.splice(idx, 1)

  await ts.logAudit(c as any, {
    action: 'ticket.deleted',
    resource: `ticket:${ticketId}`,
  })

  return c.json({ success: true })
})

// ══════════════════════════════════════════════════
// 7. Isolation Proof Endpoint
//    Shows that cross-tenant data is invisible.
//    Even with full DB access, Query Guard blocks it.
// ══════════════════════════════════════════════════

app.get('/proof/isolation', demoProtect, async (c) => {
  const tenant: any = c.get('tenant')
  // This simulates what Query Guard prevents:
  //   const allTickets = await db.query('SELECT * FROM tickets')
  //   // ^ Would return ALL tenants' data — bad!
  //
  // With TenantScale's createTenantSafeClient():
  //   const safe = createTenantSafeClient(db, tenant.id)
  //   const myTickets = await safe.query('SELECT * FROM tickets')
  //   // ^ Automatically adds WHERE tenant_id = current_tenant
  //
  // The demo store inherently enforces this — each API key
  // sees only its own tickets. Try switching tenants above!

  return c.json({
    message: `You are viewing as "${tenant.name}"`,
    isolation: true,
    your_tickets: STORE[c.get('apiKey')].tickets.length,
    other_tenants: Object.keys(STORE)
      .filter(k => k !== c.get('apiKey'))
      .map(k => ({
        tenant: STORE[k].tenant_name,
        visible: false,  // You CANNOT see their tickets
      })),
    total_tickets_visible: STORE[c.get('apiKey')].tickets.length,
    total_tickets_in_system: Object.values(STORE).reduce((sum, d) => sum + d.tickets.length, 0),
  })
})

// ══════════════════════════════════════════════════
// 8. Admin: See all tenants (requireAdmin equivalent)
//    In production, use ts.requireAdmin() middleware
// ══════════════════════════════════════════════════

app.get('/admin/tenants', demoProtect, async (c) => {
  const apiKey: string = c.get('apiKey')
  if (apiKey !== 'demo_admin') {
    return c.json({ error: 'Admin access required' }, 403)
  }
  return c.json({
    tenants: Object.entries(STORE).map(([key, data]) => ({
      name: data.tenant_name,
      slug: data.tenant_slug,
      plan: data.plan,
      ticket_count: data.tickets.length,
      features: data.features,
    })),
  })
})

// Start server
const PORT = 4000
serve({ fetch: app.fetch, port: PORT })
console.log(`\n  ╔══════════════════════════════════════════════╗`)
console.log(`  ║   TenantScale Demo — IT Help Desk          ║`)
console.log(`  ║                                          ║`)
console.log(`  ║   http://localhost:${PORT}                    ║`)
console.log(`  ║                                          ║`)
console.log(`  ║   Demo API keys:                         ║`)
console.log(`  ║     demo_acme    → Acme Corp (Pro plan)  ║`)
console.log(`  ║     demo_globex  → Globex (Free plan)    ║`)
console.log(`  ║     demo_admin   → Multi-tenant view     ║`)
console.log(`  ╚══════════════════════════════════════════════╝\n`)

// ════════════════════════════════════════════════════════
// HTML Template Functions
// ════════════════════════════════════════════════════════

function loginPage(error?: string): string {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TenantScale Demo - Help Desk</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background: #080b18; color: #e5e7eb; font-family: system-ui, sans-serif; }
    .glow { box-shadow: 0 0 60px rgba(99,102,241,0.08), 0 0 20px rgba(0,229,209,0.05); }
    .gradient-text { background: linear-gradient(135deg, #818cf8, #00E5D1); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  </style>
</head>
<body class="flex min-h-screen items-center justify-center">
  <div class="w-full max-w-md px-6">
    <div class="text-center mb-8">
      <div class="inline-flex items-center gap-2 mb-4">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <path d="M16 2L30 10V22L16 30L2 22V10L16 2Z" fill="#6366f1" opacity="0.2"/>
          <path d="M16 6L24 10.5V19.5L16 24L8 19.5V10.5L16 6Z" fill="#00E5D1" opacity="0.6"/>
          <circle cx="16" cy="15" r="3" fill="#00E5D1"/>
          <circle cx="10" cy="10" r="1.5" fill="#00E5D1" opacity="0.4"/>
          <circle cx="22" cy="10" r="1.5" fill="#00E5D1" opacity="0.4"/>
          <circle cx="10" cy="20" r="1.5" fill="#00E5D1" opacity="0.4"/>
          <circle cx="22" cy="20" r="1.5" fill="#00E5D1" opacity="0.4"/>
        </svg>
        <span class="text-xl font-bold"><span class="text-gray-300">Tenant</span><span class="text-[#00E5D1]">Scale</span></span>
      </div>
      <h1 class="text-2xl font-bold gradient-text">MSP Help Desk Demo</h1>
      <p class="text-gray-500 mt-2 text-sm">Multi-tenant IT support for managed service providers</p>
    </div>

    <div class="rounded-2xl border border-gray-800 bg-gray-900/50 p-8 glow">
      <h2 class="text-lg font-semibold mb-2">Enter a demo API key</h2>
      <p class="text-sm text-gray-500 mb-6">Each key shows a different tenant's view.<br>Try them all to see tenant isolation in action.</p>
      <form method="GET" action="/" class="space-y-4">
        <div>
          <input type="password" name="api_key" placeholder="Paste API key here"
            class="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm font-mono placeholder-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            autofocus />
        </div>
        ${error ? `<p class="text-sm text-red-400">${error}</p>` : ''}
        <button type="submit" class="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-[#00E5D1] px-4 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity">
          Enter Demo
        </button>
      </form>
      <div class="mt-6 rounded-xl border border-gray-800 bg-gray-950/50 p-4">
        <p class="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Demo API Keys</p>
        <div class="space-y-2 text-sm">
          <div class="flex items-center justify-between">
            <code class="font-mono text-xs text-indigo-400">demo_acme</code>
            <span class="text-gray-400">Acme Corp <span class="rounded bg-gray-800 px-1.5 py-0.5 text-xs text-blue-400">Pro</span></span>
          </div>
          <div class="flex items-center justify-between">
            <code class="font-mono text-xs text-amber-400">demo_globex</code>
            <span class="text-gray-400">Globex Inc <span class="rounded bg-gray-800 px-1.5 py-0.5 text-xs text-gray-500">Free</span></span>
          </div>
          <div class="flex items-center justify-between">
            <code class="font-mono text-xs text-green-400">demo_admin</code>
            <span class="text-gray-400">MSP Admin <span class="rounded bg-gray-800 px-1.5 py-0.5 text-xs text-green-400">Admin</span></span>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`
}

interface DashboardProps {
  tenantName: string
  tenantSlug: string
  plan: string
  tickets: Ticket[]
  openCount: number
  inProgressCount: number
  resolvedCount: number
  maxTickets: number | null
  currentTickets: number
  atLimit: boolean
  hasPrioritySupport: boolean
  hasSSO: boolean
  apiKey: string
  isAdmin: boolean
}

function dashboardPage(props: DashboardProps): string {
  const statusColors: Record<string, string> = {
    open: 'bg-yellow-900/30 text-yellow-400 border-yellow-800',
    in_progress: 'bg-blue-900/30 text-blue-400 border-blue-800',
    resolved: 'bg-green-900/30 text-green-400 border-green-800',
  }
  const priorityColors: Record<string, string> = {
    low: 'text-gray-400',
    medium: 'text-yellow-400',
    high: 'text-orange-400',
    critical: 'text-red-400',
  }
  const planColors: Record<string, string> = {
    free: 'bg-gray-800 text-gray-400',
    pro: 'bg-blue-900/50 text-blue-400',
    business: 'bg-purple-900/50 text-purple-400',
  }

  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TenantScale Demo - ${props.tenantName}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background: #080b18; color: #e5e7eb; font-family: system-ui, sans-serif; }
    .glow { box-shadow: 0 0 60px rgba(99,102,241,0.08), 0 0 20px rgba(0,229,209,0.05); }
    .gradient-text { background: linear-gradient(135deg, #818cf8, #00E5D1); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  </style>
</head>
<body>
  <!-- ════════════════════════════════════════════ -->
  <!-- Tenant Switcher — proves isolation          -->
  <!-- Each key shows a completely different view  -->
  <!-- ════════════════════════════════════════════ -->
  <div class="border-b border-gray-800 bg-gray-950/80">
    <div class="mx-auto flex max-w-5xl items-center justify-between px-6 py-2">
      <div class="flex items-center gap-2 text-xs text-gray-500">
        <span>🔑</span>
        <span class="font-mono">${props.apiKey}</span>
      </div>
      <div class="flex items-center gap-3 text-xs">
        <span class="text-gray-500">Switch tenant:</span>
        <a href="/?api_key=demo_acme" class="rounded-lg border border-gray-700 px-2.5 py-1 text-gray-400 hover:text-white hover:border-gray-500 transition-colors ${props.apiKey === 'demo_acme' ? 'border-indigo-600 text-indigo-400' : ''}">Acme Corp</a>
        <a href="/?api_key=demo_globex" class="rounded-lg border border-gray-700 px-2.5 py-1 text-gray-400 hover:text-white hover:border-gray-500 transition-colors ${props.apiKey === 'demo_globex' ? 'border-indigo-600 text-indigo-400' : ''}">Globex</a>
        <a href="/?api_key=demo_admin" class="rounded-lg border border-gray-700 px-2.5 py-1 text-gray-400 hover:text-white hover:border-gray-500 transition-colors ${props.apiKey === 'demo_admin' ? 'border-indigo-600 text-indigo-400' : ''}">Admin</a>
        <span class="text-gray-600">|</span>
        <a href="/" class="text-gray-500 hover:text-gray-300">Logout</a>
      </div>
    </div>
  </div>

  <div class="mx-auto max-w-5xl px-6 py-8">
    <!-- Tenant Header -->
    <div class="flex items-center justify-between mb-8">
      <div class="flex items-center gap-4">
        <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-900/30 border border-indigo-800/30">
          <span class="text-xl font-bold text-indigo-400">${props.tenantName[0]}</span>
        </div>
        <div>
          <div class="flex items-center gap-3">
            <h1 class="text-2xl font-bold">${props.tenantName}</h1>
            <span class="rounded-full px-3 py-0.5 text-xs font-medium ${planColors[props.plan] || 'bg-gray-800 text-gray-400'}">${props.plan}</span>
          </div>
          <p class="text-sm text-gray-500 mt-0.5 font-mono">${props.tenantSlug} · ${props.currentTickets} ticket${props.currentTickets !== 1 ? 's' : ''}</p>
        </div>
      </div>
      <div class="flex gap-2">
        ${props.hasPrioritySupport ? '<span class="rounded-lg border border-green-800 bg-green-900/20 px-3 py-1.5 text-xs text-green-400">Priority Support</span>' : ''}
        ${props.hasSSO ? '<span class="rounded-lg border border-blue-800 bg-blue-900/20 px-3 py-1.5 text-xs text-blue-400">SSO</span>' : ''}
      </div>
    </div>

    <!-- Plan Limit Banner -->
    ${props.atLimit ? `
    <div class="mb-6 rounded-xl border border-amber-800 bg-amber-900/20 p-4 text-sm text-amber-400">
      ⚠️ Ticket limit reached (${props.currentTickets}/${props.maxTickets}). Upgrade to create more.
    </div>` : ''}

    <div class="flex items-center justify-between mb-6">
      <h2 class="text-lg font-semibold">Support Tickets</h2>
      <button onclick="showCreateForm()" class="rounded-xl bg-gradient-to-r from-indigo-600 to-[#00E5D1] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
        ${props.atLimit ? 'disabled style="opacity:0.4;cursor:not-allowed"' : ''}>
        + New Ticket
      </button>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-3 gap-4 mb-8">
      <div class="rounded-xl border border-gray-800 bg-gray-900/50 p-4 text-center glow">
        <p class="text-2xl font-bold text-yellow-400">${props.openCount}</p>
        <p class="text-xs text-gray-500 mt-1">Open</p>
      </div>
      <div class="rounded-xl border border-gray-800 bg-gray-900/50 p-4 text-center glow">
        <p class="text-2xl font-bold text-blue-400">${props.inProgressCount}</p>
        <p class="text-xs text-gray-500 mt-1">In Progress</p>
      </div>
      <div class="rounded-xl border border-gray-800 bg-gray-900/50 p-4 text-center glow">
        <p class="text-2xl font-bold text-green-400">${props.resolvedCount}</p>
        <p class="text-xs text-gray-500 mt-1">Resolved</p>
      </div>
    </div>

    <!-- Ticket List -->
    <div class="rounded-2xl border border-gray-800 overflow-hidden glow">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-800 bg-gray-900/50">
            <th class="px-5 py-3.5 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">Ticket</th>
            <th class="px-5 py-3.5 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">Status</th>
            <th class="px-5 py-3.5 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">Priority</th>
            <th class="px-5 py-3.5 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">Requester</th>
            <th class="px-5 py-3.5 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">Created</th>
            <th class="px-5 py-3.5 text-right font-medium text-gray-500 text-xs uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${props.tickets.map(t => `
          <tr class="border-b border-gray-800/50 transition-colors hover:bg-gray-900/30">
            <td class="px-5 py-4 font-medium">${t.title}</td>
            <td class="px-5 py-4">
              <span class="rounded-full border px-2.5 py-0.5 text-xs ${statusColors[t.status] || ''}">${t.status.replace('_', ' ')}</span>
            </td>
            <td class="px-5 py-4">
              <span class="text-xs font-medium ${priorityColors[t.priority] || ''}">${t.priority}</span>
            </td>
            <td class="px-5 py-4 text-gray-400 text-xs">${t.requester}</td>
            <td class="px-5 py-4 text-gray-500 text-xs">${new Date(t.created_at).toLocaleDateString()}</td>
            <td class="px-5 py-4 text-right">
              <select onchange="updateTicket('${t.id}', this.value)" class="rounded-lg border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-300 focus:border-blue-500 focus:outline-none">
                <option value="">Actions</option>
                <option value="in_progress">Start</option>
                <option value="resolved">Resolve</option>
                <option value="open">Reopen</option>
              </select>
            </td>
          </tr>`).join('')}
          ${props.tickets.length === 0 ? '<tr><td colspan="6" class="px-5 py-12 text-center text-gray-500">No tickets yet.</td></tr>' : ''}
        </tbody>
      </table>
    </div>

    <!-- Isolation Proof -->
    <div class="mt-8 rounded-2xl border border-indigo-900/40 bg-indigo-950/20 p-6 glow">
      <div class="flex items-start gap-4">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-900/30 border border-indigo-800/30 flex-shrink-0">
          <svg class="h-5 w-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
          </svg>
        </div>
        <div>
          <h3 class="font-semibold text-indigo-300 mb-1">Tenant Isolation is Active</h3>
          <p class="text-sm text-indigo-400/70">
            You are viewing <strong>${props.tenantName}'s</strong> tickets only.
            The other ${
              Object.keys(STORE).filter(k => k !== props.apiKey).length
            } tenants in this system have their own ticket data that you cannot see.
            ${props.apiKey === 'demo_admin' ? 'As admin, you can view all tenants at <code class="font-mono text-xs">/admin/tenants</code>.' : ''}
          </p>
        </div>
      </div>
    </div>
  </div>

  <!-- Create Ticket Modal -->
  <div id="createModal" class="fixed inset-0 z-50 hidden items-center justify-center bg-black/60">
    <div class="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-6 mx-4 glow">
      <div class="flex items-center justify-between mb-6">
        <h3 class="text-lg font-semibold">New Support Ticket</h3>
        <button onclick="hideCreateForm()" class="text-gray-500 hover:text-gray-300">&times;</button>
      </div>
      <form id="ticketForm" class="space-y-4">
        <div>
          <label class="block text-sm text-gray-400 mb-1.5">Title</label>
          <input type="text" id="ticketTitle" placeholder="Describe the issue..."
            class="w-full rounded-xl border border-gray-700 bg-gray-950 px-4 py-2.5 text-sm placeholder-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" required />
        </div>
        <div>
          <label class="block text-sm text-gray-400 mb-1.5">Priority</label>
          <select id="ticketPriority"
            class="w-full rounded-xl border border-gray-700 bg-gray-950 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none">
            <option value="low">Low</option>
            <option value="medium" selected>Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <button type="submit" class="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-[#00E5D1] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity">
          Create Ticket
        </button>
      </form>
    </div>
  </div>

  <script>
    function showCreateForm() { document.getElementById('createModal').classList.remove('hidden'); document.getElementById('createModal').classList.add('flex'); }
    function hideCreateForm() { document.getElementById('createModal').classList.remove('flex'); document.getElementById('createModal').classList.add('hidden'); }
    document.getElementById('ticketForm')?.addEventListener('submit', async (e) => {
      e.preventDefault()
      const title = document.getElementById('ticketTitle').value
      const priority = document.getElementById('ticketPriority').value
      const res = await fetch('/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ${props.apiKey}' },
        body: JSON.stringify({ title, priority }),
      })
      if (res.ok) { location.reload() }
      else { const d = await res.json(); alert(d.error) }
    })
    async function updateTicket(id, status) {
      if (!status) return
      const res = await fetch('/tickets/' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ${props.apiKey}' },
        body: JSON.stringify({ status }),
      })
      if (res.ok) location.reload()
    }
  </script>
</body>
</html>`
}

// Export app for testing
export default app
