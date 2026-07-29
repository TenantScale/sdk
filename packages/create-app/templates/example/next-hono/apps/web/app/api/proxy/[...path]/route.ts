// ──────────────────────────────────────────────────────
// BFF Proxy — forwards /api/proxy/* to the API server
// ──────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params
  return proxy(request, path, 'GET')
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params
  return proxy(request, path, 'POST')
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params
  return proxy(request, path, 'PATCH')
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params
  return proxy(request, path, 'DELETE')
}

async function proxy(request: NextRequest, path: string[], method: string) {
  const apiPath = '/' + path.join('/')
  const url = `${API_BASE}${apiPath}`

  // Forward auth headers from the client
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const auth = request.headers.get('authorization')
  if (auth) headers['Authorization'] = auth

  // Forward Supabase session cookie
  const cookie = request.headers.get('cookie')
  if (cookie) headers['Cookie'] = cookie

  const body = method !== 'GET' ? await request.text() : undefined

  try {
    const res = await fetch(url, { method, headers, body })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'Failed to reach API server' }, { status: 503 })
  }
}
