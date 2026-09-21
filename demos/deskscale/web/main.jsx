import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

const API = '/api'
let sessionKey = localStorage.getItem('ts_key') || null

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  if (sessionKey) headers['x-api-key'] = sessionKey
  const res = await fetch(API + path, { ...opts, headers })
  const text = await res.text()
  const body = text ? JSON.parse(text) : null
  return { status: res.status, body }
}

// ── Branding map (keys → company) for the login screen ──
const KEYS = [
  { key: 'acme-admin-key', name: 'Acme Corp · Admin', color: '#f97316' },
  { key: 'acme-agent-key', name: 'Acme Corp · Agent', color: '#f97316' },
  { key: 'globex-admin-key', name: 'Globex Industries · Admin', color: '#14b8a6' },
  { key: 'globex-agent-key', name: 'Globex Industries · Agent', color: '#14b8a6' },
  { key: 'initech-admin-key', name: 'Initech · Free plan', color: '#6366f1' },
  { key: 'superadmin-key', name: 'Superadmin · Platform desk', color: '#111827' },
]

function App() {
  const [loggedKey, setLoggedKey] = useState(sessionKey)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('conversations')

  async function login(key) {
    sessionKey = key
    localStorage.setItem('ts_key', key)
    setLoggedKey(key)
    setLoading(true)
    const { status, body } = await api('/me')
    setLoading(false)
    if (status === 200) {
      setSession(body)
      setTab(body.agent?.scopes?.includes('admin:view') ? 'admin' : 'conversations')
    } else {
      setSession(null)
      alert(body?.message || 'Login failed')
    }
  }

  function logout() {
    sessionKey = null
    localStorage.removeItem('ts_key')
    setLoggedKey(null)
    setSession(null)
  }

  if (!loggedKey) {
    return <LoginScreen keys={KEYS} onLogin={login} loading={loading} />
  }
  if (!session) {
    return <div style={{ padding: 40 }}>Authenticating…</div>
  }

  const tenant = session.tenant
  const agent = session.agent
  const isSuper = agent?.scopes?.includes('admin:view')

  return (
    <Shell
      tenant={tenant}
      agent={agent}
      isSuper={!!isSuper}
      tab={tab}
      setTab={setTab}
      onLogout={logout}
      onSwitch={login}
    >
      {tab === 'admin' && isSuper ? <AdminDesk /> : <ConversationsView />}
    </Shell>
  )
}

// ── Login ──
function LoginScreen({ keys, onLogin, loading }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0b1220',
      }}
    >
      <div
        style={{
          width: 460,
          background: '#fff',
          borderRadius: 16,
          padding: '36px 32px',
          boxShadow: '0 24px 60px rgba(0,0,0,.4)',
        }}
      >
        <div style={{ fontSize: 26, fontWeight: 800, color: '#111827' }}>DeskScale</div>
        <div style={{ color: '#6b7280', marginTop: 6, fontSize: 14 }}>
          One SaaS, many companies. Each tenant sees only its own world.
        </div>
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {keys.map((k) => (
            <button
              key={k.key}
              onClick={() => onLogin(k.key)}
              disabled={loading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 14px',
                borderRadius: 10,
                border: '1px solid #e5e7eb',
                background: '#fff',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'border .15s',
              }}
            >
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 4,
                  background: k.color,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2937' }}>{k.name}</span>
            </button>
          ))}
        </div>
        {loading && (
          <div style={{ marginTop: 16, color: '#6b7280', fontSize: 14 }}>
            Authenticating API key…
          </div>
        )}
        <div
          style={{
            marginTop: 20,
            fontSize: 12,
            color: '#9ca3af',
            borderTop: '1px solid #eee',
            paddingTop: 16,
          }}
        >
          Every button presents a real TenantScale API key. Scope + tenant are enforced server-side.
        </div>
      </div>
    </div>
  )
}

// ── Shell ──
function Shell({ tenant, agent, isSuper, tab, setTab, onLogout, onSwitch, children }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f7' }}>
      <header
        style={{
          background: tenant.brandColor,
          color: '#fff',
          padding: '0 24px',
          height: 60,
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          boxShadow: '0 2px 8px rgba(0,0,0,.15)',
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 0.5 }}>DeskScale</div>
        <div style={{ opacity: 0.85, fontSize: 13 }}>
          {tenant.name} · {agent?.name} · {agent?.role}
        </div>
        <div style={{ flex: 1 }} />
        <NavBtn active={tab === 'conversations'} onClick={() => setTab('conversations')}>
          Inbox
        </NavBtn>
        {isSuper && (
          <NavBtn active={tab === 'admin'} onClick={() => setTab('admin')}>
            Platform Desk
          </NavBtn>
        )}
        <select
          value=""
          onChange={(e) => e.target.value && onSwitch(e.target.value)}
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            border: 'none',
            color: '#111827',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          <option value="" disabled>
            Switch tenant…
          </option>
          {KEYS.map((k) => (
            <option key={k.key} value={k.key}>
              {k.name}
            </option>
          ))}
        </select>
        <button
          onClick={onLogout}
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px solid rgba(255,255,255,.6)',
            background: 'transparent',
            color: '#fff',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          Sign out
        </button>
      </header>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>{children}</div>
    </div>
  )
}

function NavBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 14px',
        borderRadius: 8,
        border: 'none',
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: 600,
        background: active ? 'rgba(255,255,255,.22)' : 'transparent',
        color: '#fff',
      }}
    >
      {children}
    </button>
  )
}

// ── Conversations view (tenant inbox) ──
function ConversationsView() {
  const [convos, setConvos] = useState(null)
  const [contacts, setContacts] = useState(null)
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [reply, setReply] = useState('')
  const [limit, setLimit] = useState(null)
  const [newMsg, setNewMsg] = useState('')
  const [pulse, setPulse] = useState([])
  const [probe, setProbe] = useState(null)

  async function refresh() {
    const [cRes, ctRes] = await Promise.all([api('/conversations'), api('/contacts')])
    setConvos(cRes.body)
    setContacts(ctRes.body)
    const p = await api('/pulse')
    setPulse(p.body || [])
  }

  useEffect(() => {
    refresh()
  }, [])
  useEffect(() => {
    if (detail) {
      const id = setInterval(() => {
        api('/pulse').then((r) => setPulse(r.body || []))
      }, 4000)
      return () => clearInterval(id)
    }
  }, [detail])

  async function open(id) {
    const { status, body } = await api(`/conversations/${id}`)
    if (status === 404) {
      setDetail(null)
      setToast({ type: 'fail', msg: '404 — not in your tenant' })
      return
    }
    setDetail(body)
    setProbe(null)
  }

  function flash(t) {
    setToast(t)
    setTimeout(() => setToast(null), 3000)
  }

  async function sendReply() {
    if (!reply.trim() || !detail) return
    const { status, body } = await api(`/conversations/${detail.id}/reply`, {
      method: 'POST',
      body: JSON.stringify({ message: reply.trim() }),
    })
    if (status === 201) {
      setReply('')
      await open(detail.id)
      flash({ type: 'ok', msg: 'Reply sent (reply:conversations)' })
    } else {
      setProbe(body)
      flash({ type: 'fail', msg: body?.message || 'Reply blocked' })
    }
  }

  async function createConversation() {
    if (!newMsg.trim()) return
    const contactId = contacts?.data?.[0]?.id
    if (!contactId) {
      flash({ type: 'fail', msg: 'No contact in this tenant' })
      return
    }
    const { status, body } = await api('/conversations', {
      method: 'POST',
      body: JSON.stringify({ contactId, subject: newMsg.slice(0, 60), message: newMsg }),
    })
    if (status === 201) {
      setNewMsg('')
      await refresh()
      flash({ type: 'ok', msg: 'Created (manage:conversations + plan limit passed)' })
    } else {
      setLimit(body)
      flash({ type: 'fail', msg: body?.message || 'Create blocked (403 scope / plan limit)' })
    }
  }

  async function probeIsolation() {
    // find a conversation id that LIKELY belongs to another tenant
    const target = 2 // seeded globex conversation id
    setLimit(null)
    const { status, body } = await api(`/admin/probe/${target}`)
    setProbe(body || { status })
    if (status === 200 && body?.verdict) {
      flash({ type: body.verdict.startsWith('ISOLATED') ? 'ok' : 'warn', msg: body.verdict })
    }
    const p = await api('/pulse')
    setPulse(p.body || [])
  }

  if (!convos) return <div style={{ padding: 40, color: '#6b7280' }}>Loading…</div>

  const convCount = convos.data?.length ?? 0

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20 }}>
      {/* left: inbox + compose + contacts */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div
          style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 16 }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
            Inbox · {convCount} conversations
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {convos.data?.map((c) => (
              <button
                key={c.id}
                onClick={() => open(c.id)}
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: detail?.id === c.id ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                  background: '#fff',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937' }}>{c.subject}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                  {c.contact?.name} · {c.status}
                </div>
              </button>
            ))}
            {!convos.data?.length && (
              <div style={{ color: '#9ca3af', fontSize: 13 }}>No conversations in this tenant.</div>
            )}
          </div>
        </div>

        <div
          style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 16 }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>New conversation</div>
          <textarea
            value={newMsg}
            onChange={(e) => setNewMsg(e.target.value)}
            placeholder="Message / subject…"
            rows={3}
            style={{
              width: '100%',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              padding: 10,
              fontSize: 13,
              resize: 'none',
            }}
          />
          <button
            onClick={createConversation}
            style={{
              marginTop: 10,
              width: '100%',
              padding: 10,
              borderRadius: 8,
              border: 'none',
              background: '#3b82f6',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Create
          </button>
          {limit && (
            <div
              style={{
                marginTop: 10,
                fontSize: 12,
                color: '#b91c1c',
                background: '#fee2e2',
                padding: '8px 10px',
                borderRadius: 8,
              }}
            >
              Blocked: {limit.message}
            </div>
          )}
        </div>

        <button
          onClick={probeIsolation}
          style={{
            padding: 10,
            borderRadius: 8,
            border: '1px dashed #d1d5db',
            background: '#fff',
            cursor: 'pointer',
            fontSize: 13,
            color: '#374151',
          }}
        >
          🔍 Try cross-tenant probe (open another tenant's conversation)
        </button>
        {probe && (
          <div
            style={{
              fontSize: 12,
              background: '#111827',
              color: '#e5e7eb',
              borderRadius: 8,
              padding: 12,
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
            }}
          >
            {typeof probe.verdict !== 'undefined'
              ? `verdict: ${probe.verdict}`
              : JSON.stringify(probe, null, 2)}
          </div>
        )}
      </div>

      {/* right: detail + pulse */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {detail ? (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb' }}>
            <div
              style={{
                padding: 16,
                borderBottom: '1px solid #eee',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>{detail.subject}</div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>{detail.contact?.name}</div>
            </div>
            <div
              style={{
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                maxHeight: 320,
                overflowY: 'auto',
              }}
            >
              {detail.messages?.map((m) => (
                <div
                  key={m.id}
                  style={{
                    alignSelf: m.author === 'agent' ? 'flex-end' : 'flex-start',
                    maxWidth: '80%',
                    ...(m.author === 'agent'
                      ? { background: '#eef2ff', color: '#1e1b4b' }
                      : { background: '#f3f4f6', color: '#111827' }),
                    borderRadius: 10,
                    padding: '10px 14px',
                    fontSize: 14,
                  }}
                >
                  {m.body}
                </div>
              ))}
            </div>
            <div style={{ padding: 16, borderTop: '1px solid #eee', display: 'flex', gap: 10 }}>
              <input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Type a reply as an agent…"
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid #d1d5db',
                  fontSize: 14,
                }}
              />
              <button
                onClick={sendReply}
                style={{
                  padding: '10px 18px',
                  borderRadius: 8,
                  border: 'none',
                  background: KEYS.find((k) => k.key === loggedKey)?.color || '#3b82f6',
                  color: '#fff',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Reply
              </button>
            </div>
            {probe && (
              <div
                style={{
                  padding: 12,
                  fontSize: 12,
                  fontFamily: 'monospace',
                  background: '#f9fafb',
                  borderTop: '1px solid #eee',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {JSON.stringify(probe, null, 2)}
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              border: '1px solid #e5e7eb',
              padding: 40,
              textAlign: 'center',
              color: '#9ca3af',
            }}
          >
            Select a conversation to open it. It only exists if it's in <b>your</b> tenant.
          </div>
        )}

        {/* live pulse */}
        <PulsePanel events={pulse} />
      </div>
    </div>
  )
}

function PulsePanel({ events }) {
  return (
    <div style={{ background: '#111827', borderRadius: 12, padding: 16, color: '#e5e7eb' }}>
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          marginBottom: 10,
          color: '#9ca3af',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 50,
            background: '#34d399',
            display: 'inline-block',
          }}
        />
        LIVE REQUEST PULSE — TenantScale resolving each call
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          fontSize: 12,
          fontFamily: 'monospace',
        }}
      >
        {events.length === 0 && <span style={{ color: '#6b7280' }}>No requests yet.</span>}
        {events.slice(0, 8).map((e, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            <span style={{ color: '#60a5fa', flexShrink: 0 }}>{shortTenant(e.tenant)}</span>
            <span style={{ color: '#e5e7eb' }}>
              {e.method} {e.path}
            </span>
            <span style={{ color: e.status < 400 ? '#34d399' : '#f87171', fontWeight: 700 }}>
              {e.status}
            </span>
            <span style={{ color: '#9ca3af', marginLeft: 'auto' }}>{e.rule}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function shortTenant(t) {
  if (t === 'superadmin') return t
  return t.replace('tenant_', '').slice(0, 12)
}

// ── Admin / platform desk ═─
function AdminDesk() {
  const [data, setData] = useState(null)
  const [pulse, setPulse] = useState([])
  useEffect(() => {
    async function run() {
      const { status, body } = await api('/admin/tenants')
      setData({ status, body })
      const p = await api('/pulse')
      setPulse(p.body || [])
    }
    run()
  }, [])
  if (!data) return <div style={{ padding: 40, color: '#6b7280' }}>Loading platform desk…</div>
  if (data.status !== 200)
    return (
      <div style={{ background: '#fee2e2', color: '#b91c1c', padding: 20, borderRadius: 12 }}>
        Access denied — {data.body?.message}. Only keys with <code>admin:view</code> can see all
        tenants.
      </div>
    )
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 20 }}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Platform Desk</div>
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 18 }}>
        Super-admin only. Every row is a tenant — the same app, isolated by TenantScale.
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr
            style={{
              textAlign: 'left',
              color: '#6b7280',
              fontSize: 12,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            <th style={{ padding: '8px 10px', borderBottom: '2px solid #e5e7eb' }}>Tenant</th>
            <th style={{ padding: '8px 10px', borderBottom: '2px solid #e5e7eb' }}>Plan</th>
            <th style={{ padding: '8px 10px', borderBottom: '2px solid #e5e7eb' }}>
              Conversations
            </th>
          </tr>
        </thead>
        <tbody>
          {data.body?.data?.map((t) => (
            <tr key={t.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td
                style={{
                  padding: 12,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 4,
                    background: t.brandColor,
                    display: 'inline-block',
                  }}
                />
                {t.name}{' '}
                <span style={{ fontWeight: 400, color: '#9ca3af', fontSize: 12 }}>{t.id}</span>
              </td>
              <td style={{ padding: 12 }}>
                <span
                  style={{
                    padding: '2px 10px',
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 600,
                    background: t.plan === 'pro' ? '#dbeafe' : '#fef3c7',
                    color: t.plan === 'pro' ? '#1d4ed8' : '#92400e',
                  }}
                >
                  {t.plan}
                </span>
              </td>
              <td style={{ padding: 12, color: '#374151' }}>{t.conversations}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 16 }}>
        <PulsePanel events={pulse} />
      </div>
    </div>
  )
}

export default App

createRoot(document.getElementById('root')).render(<App />)
