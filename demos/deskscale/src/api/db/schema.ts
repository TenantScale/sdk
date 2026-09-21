import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

// ── Tenants (the "companies" using the white-label SaaS) ──
export const tenants = sqliteTable('tenants', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  brandColor: text('brand_color').notNull().default('#3b82f6'),
  plan: text('plan').notNull().default('free'), // free | pro
  maxConversations: integer('max_conversations').notNull().default(3), // plan limit
})

// ── Contacts (customers managed inside a tenant) ──
export const contacts = sqliteTable('contacts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  email: text('email').notNull(),
})

// ── Conversations (per tenant, each tied to a contact) ──
export const conversations = sqliteTable('conversations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: text('tenant_id').notNull(),
  contactId: integer('contact_id').notNull(),
  subject: text('subject').notNull(),
  status: text('status').notNull().default('open'), // open | pending | resolved
})

// ── Messages inside a conversation ──
export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  conversationId: integer('conversation_id').notNull(),
  tenantId: text('tenant_id').notNull(), // denormalized for isolation safety
  author: text('author').notNull(), // contact | agent
  body: text('body').notNull(),
  createdAt: text('created_at').notNull(),
})

// ── Agents (per-tenant users with scopes) ──
export const agents = sqliteTable('agents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  role: text('role').notNull().default('agent'), // agent | admin
  apiKey: text('api_key').notNull(),
  scopes: text('scopes').notNull().default('read:conversations,reply:conversations'),
})

export type Tenant = typeof tenants.$inferSelect
export type Contact = typeof contacts.$inferSelect
export type Conversation = typeof conversations.$inferSelect
export type Message = typeof messages.$inferSelect
export type Agent = typeof agents.$inferSelect
