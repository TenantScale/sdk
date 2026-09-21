import { Injectable } from '@nestjs/common'

export interface PulseEvent {
  at: string
  tenant: string // tenant_id or '—'
  method: string
  path: string
  scope: string // enforced scope(s) or '—'
  rule: string // rule that decided this request
  status: number
  msg: string
}

// In-memory ring buffer of the last N guard decisions, so the UI can render a
// live "request pulse" showing TenantScale resolving each call.
const MAX = 40
const events: PulseEvent[] = []

@Injectable()
export class PulseService {
  push(e: Omit<PulseEvent, 'at'>): PulseEvent {
    const rec = { ...e, at: new Date().toISOString() }
    events.push(rec)
    if (events.length > MAX) events.shift()
    return rec
  }

  recent(): PulseEvent[] {
    return [...events].reverse()
  }
}
