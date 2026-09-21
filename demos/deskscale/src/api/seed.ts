import { sql } from 'drizzle-orm'
import { db } from './db/index.js'
import { agents, contacts, conversations, messages, tenants } from './db/schema.js'

// ── Seed DeskScale with realistic multi-tenant data ──────────────
// Three companies use the same white-label app. Each row is scoped by
// tenant_id, and each agent presents a real API key the adapter resolves.

const TENANTS = [
  {
    id: 'tenant_acme',
    slug: 'acme',
    name: 'Acme Corp',
    brandColor: '#f97316',
    plan: 'pro',
    maxConversations: 50,
  },
  {
    id: 'tenant_globex',
    slug: 'globex',
    name: 'Globex Industries',
    brandColor: '#14b8a6',
    plan: 'pro',
    maxConversations: 50,
  },
  {
    id: 'tenant_initech',
    slug: 'initech',
    name: 'Initech',
    brandColor: '#6366f1',
    plan: 'free',
    maxConversations: 3, // free plan caps at 3 - fail-closed test
  },
]

const AGENTS = [
  // Acme
  {
    tenantId: 'tenant_acme',
    name: 'Sam Rivera',
    role: 'admin',
    apiKey: 'acme-admin-key',
    scopes: 'read:conversations,reply:conversations,manage:conversations,manage:agents',
  },
  {
    tenantId: 'tenant_acme',
    name: 'Priya Shah',
    role: 'agent',
    apiKey: 'acme-agent-key',
    scopes: 'read:conversations,reply:conversations',
  },
  // Globex
  {
    tenantId: 'tenant_globex',
    name: 'Dana Kim',
    role: 'admin',
    apiKey: 'globex-admin-key',
    scopes: 'read:conversations,reply:conversations,manage:conversations,manage:agents',
  },
  {
    tenantId: 'tenant_globex',
    name: 'Leo Petit',
    role: 'agent',
    apiKey: 'globex-agent-key',
    scopes: 'read:conversations,reply:conversations',
  },
  // Initech (free plan)
  {
    tenantId: 'tenant_initech',
    name: 'Peter Gibbons',
    role: 'admin',
    apiKey: 'initech-admin-key',
    scopes: 'read:conversations,reply:conversations,manage:conversations,manage:agents',
  },
]

const CONTACTS = [
  { tenantId: 'tenant_acme', name: 'Acme Billing', email: 'billing@acme.test' },
  { tenantId: 'tenant_acme', name: 'Acme Ops', email: 'ops@acme.test' },
  { tenantId: 'tenant_globex', name: 'Globex Sales', email: 'sales@globex.test' },
  { tenantId: 'tenant_globex', name: 'Globex HR', email: 'hr@globex.test' },
  { tenantId: 'tenant_initech', name: 'Initech IT', email: 'it@initech.test' },
  { tenantId: 'tenant_initech', name: 'Initech Payroll', email: 'payroll@initech.test' },
]

const CONVERSATIONS: Array<{
  tenantId: string
  contactName: string
  subject: string
  status: string
  msgs: Array<[string, string]>
}> = [
  {
    tenantId: 'tenant_acme',
    contactName: 'Acme Billing',
    subject: 'Invoice discrepancy on last cycle',
    status: 'open',
    msgs: [
      ['contact', 'Hi, our last invoice looks off. Can you check line item 4?'],
      ['agent', 'Sure — pulling that invoice now, one moment.'],
    ],
  },
  {
    tenantId: 'tenant_acme',
    contactName: 'Acme Ops',
    subject: 'New user onboarding',
    status: 'pending',
    msgs: [['agent', 'We need account provisioning details for the new hire.']],
  },
  {
    tenantId: 'tenant_globex',
    contactName: 'Globex Sales',
    subject: 'API rate limits',
    status: 'open',
    msgs: [
      ['contact', 'We are hitting rate limits on the export endpoint.'],
      ['agent', 'Checking the plan tier — we may need to raise the quota.'],
    ],
  },
  {
    tenantId: 'tenant_globex',
    contactName: 'Globex HR',
    subject: 'SSO configuration help',
    status: 'resolved',
    msgs: [
      ['contact', 'SSO is not signing in after the update.'],
      ['agent', 'Re-issued the SAML cert, resolved.'],
    ],
  },
  {
    tenantId: 'tenant_initech',
    contactName: 'Initech IT',
    subject: 'Printer connectivity',
    status: 'open',
    msgs: [['contact', 'The office printers keep dropping off the network.']],
  },
]

export async function seed(): Promise<void> {
  await db.delete(agents)
  await db.delete(messages)
  await db.delete(conversations)
  await db.delete(contacts)
  await db.delete(tenants)

  await db.insert(tenants).values(TENANTS)
  await db.insert(agents).values(AGENTS)

  for (const c of CONTACTS) {
    const [row] = await db.insert(contacts).values(c).returning()
    for (const conv of CONVERSATIONS.filter(
      (x) => x.tenantId === c.tenantId && x.contactName === c.name,
    )) {
      const [convRow] = await db
        .insert(conversations)
        .values({
          tenantId: c.tenantId,
          contactId: row.id,
          subject: conv.subject,
          status: conv.status as string,
        })
        .returning()
      for (const [author, body] of conv.msgs) {
        await db.insert(messages).values({
          conversationId: convRow.id,
          tenantId: c.tenantId,
          author,
          body,
          createdAt: new Date().toISOString(),
        })
      }
    }
  }

  const tenantsOut = await db
    .select({ id: tenants.id, name: tenants.name, plan: tenants.plan })
    .from(tenants)
  const agentsOut = await db.select({ name: agents.name, apiKey: agents.apiKey }).from(agents)
  const convCount = await db.select({ n: sql<number>`count(*)` }).from(conversations)
  console.log(
    'Seeded',
    tenantsOut.length,
    'tenants:',
    tenantsOut.map((t) => `${t.name}(${t.plan})`).join(', '),
  )
  console.log('Agents:', agentsOut.map((a) => `${a.name} [${a.apiKey}]`).join(', '))
  console.log('Conversations:', convCount[0].n)
}

// allow `pnpm seed` — runs when invoked directly as a CLI entrypoint
const isMain = process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')
if (isMain) {
  void seed()
}
