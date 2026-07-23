// ──────────────────────────────────────────────────────
// Audit logging — framework-agnostic
// ──────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuditEventInput, Logger } from './types.js'

/** Default logger — just console */
const defaultLogger: Logger = {
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
}

let auditLogger: Logger = defaultLogger

/** Override the internal logger (used by TenantScale class) */
export function setAuditLogger(logger: Logger): void {
  auditLogger = logger
}

/**
 * Extract client IP from request headers (framework-agnostic).
 * Checks x-forwarded-for first (supports comma-separated lists),
 * falls back to x-real-ip, then unknown.
 *
 * Pass `req.headers` from Express, `c.req.raw.headers` from Hono,
 * or `Headers` from any framework.
 */
export function getClientIp(
  headers: Headers | Record<string, string | string[] | undefined>,
): string {
  // If it's a Headers object (Web API style)
  if (typeof (headers as Headers).get === 'function') {
    const h = headers as Headers
    const forwarded = h.get('x-forwarded-for')
    if (forwarded) {
      const firstIp = forwarded.split(',')[0]?.trim()
      if (firstIp) return firstIp
    }
    return h.get('x-real-ip') ?? 'unknown'
  }

  // Plain record (e.g. Express req.headers)
  const rec = headers as Record<string, string | string[] | undefined>
  const forwarded =
    typeof rec['x-forwarded-for'] === 'string'
      ? rec['x-forwarded-for']
      : Array.isArray(rec['x-forwarded-for'])
        ? rec['x-forwarded-for'][0]
        : undefined
  if (forwarded) {
    const firstIp = forwarded.split(',')[0]?.trim()
    if (firstIp) return firstIp
  }
  const realIp =
    typeof rec['x-real-ip'] === 'string'
      ? rec['x-real-ip']
      : Array.isArray(rec['x-real-ip'])
        ? rec['x-real-ip'][0]
        : undefined
  return realIp ?? 'unknown'
}

/**
 * Log an audit event to the database.
 * Fire-and-forget — never blocks the caller.
 *
 * @param supabase - Supabase admin client
 * @param input - The audit event data
 */
export async function logAuditEvent(
  supabase: SupabaseClient,
  input: AuditEventInput,
): Promise<void> {
  try {
    await supabase.from('audit_events').insert({
      tenant_id: input.tenant_id,
      actor_id: input.actor_id ?? null,
      actor_type: input.actor_type,
      action: input.action,
      resource: input.resource,
      details: input.details ?? {},
      ip: input.ip ?? null,
      user_agent: input.user_agent ?? null,
    })
  } catch (err) {
    auditLogger.warn(err, '[Audit] Failed to log event')
  }
}

/**
 * Create a simple audit event input from common parameters.
 */
export function createAuditEvent(
  tenantId: string,
  action: string,
  resource: string,
  overrides?: Partial<AuditEventInput>,
): AuditEventInput {
  return {
    tenant_id: tenantId,
    actor_type: 'system',
    action,
    resource,
    ...overrides,
  }
}
