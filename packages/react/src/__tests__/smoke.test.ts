/*
 * MIT License
 *
 * Copyright (c) 2026 TenantScale
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

// ──────────────────────────────────────────────────────
// @tenantscale/react — Smoke tests
// ──────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'

// Verify all exports load correctly
describe('@tenantscale/react', () => {
  it('exports TenantProvider', async () => {
    const { TenantProvider } = await import('../context.js')
    expect(TenantProvider).toBeDefined()
    expect(typeof TenantProvider).toBe('function')
  })

  it('exports useTenantScale', async () => {
    const { useTenantScale } = await import('../context.js')
    expect(useTenantScale).toBeDefined()
    expect(typeof useTenantScale).toBe('function')
  })

  it('exports useClient', async () => {
    const { useClient } = await import('../context.js')
    expect(useClient).toBeDefined()
    expect(typeof useClient).toBe('function')
  })

  it('exports TenantScaleClient', async () => {
    const { TenantScaleClient } = await import('../client.js')
    expect(TenantScaleClient).toBeDefined()
    // Can instantiate
    const client = new TenantScaleClient({ baseUrl: 'http://localhost:3001' })
    expect(client).toBeInstanceOf(TenantScaleClient)
    expect(client.getMe).toBeDefined()
    expect(client.getApiKeys).toBeDefined()
    expect(client.getTeam).toBeDefined()
    expect(client.getAuditLog).toBeDefined()
    expect(client.getWebhooks).toBeDefined()
  })

  it('exports all hooks', async () => {
    const mod = await import('../index.js')
    expect(mod.useTenant).toBeDefined()
    expect(mod.usePlan).toBeDefined()
    expect(mod.useApiKeys).toBeDefined()
    expect(mod.useTeam).toBeDefined()
    expect(mod.useAuditLog).toBeDefined()
    expect(mod.useWebhooks).toBeDefined()
  })

  it('exports SSR helpers', async () => {
    const mod = await import('../ssr.js')
    expect(mod.getTenantSsr).toBeDefined()
    expect(mod.getTenantSsrFromHeaders).toBeDefined()
  })

  it('exports all types', async () => {
    const mod = await import('../types.js')
    // Type-only exports won't exist at runtime, but the file should parse
    expect(mod).toBeDefined()
  })

  it('TenantScaleClient has end-to-end methods', async () => {
    const { TenantScaleClient } = await import('../client.js')
    const client = new TenantScaleClient({ baseUrl: 'http://localhost:3001' })

    // Me
    expect(typeof client.getMe).toBe('function')

    // API Keys
    expect(typeof client.getApiKeys).toBe('function')
    expect(typeof client.createApiKey).toBe('function')
    expect(typeof client.revokeApiKey).toBe('function')

    // Team
    expect(typeof client.getTeam).toBe('function')
    expect(typeof client.inviteMember).toBe('function')
    expect(typeof client.removeMember).toBe('function')
    expect(typeof client.changeMemberRole).toBe('function')

    // Audit
    expect(typeof client.getAuditLog).toBe('function')

    // Webhooks
    expect(typeof client.getWebhooks).toBe('function')
    expect(typeof client.createWebhook).toBe('function')
    expect(typeof client.updateWebhook).toBe('function')
    expect(typeof client.deleteWebhook).toBe('function')
    expect(typeof client.getWebhookDeliveries).toBe('function')

    // Cache management
    expect(typeof client.clearCache).toBe('function')
    expect(typeof client.invalidate).toBe('function')
  })
})
