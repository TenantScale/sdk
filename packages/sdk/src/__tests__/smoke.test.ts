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
// @tenantscale/sdk — Smoke tests
// ──────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'

describe('@tenantscale/sdk', () => {
  it('exports TenantScale class', async () => {
    const { TenantScale } = await import('../sdk.ts')
    expect(TenantScale).toBeDefined()
    expect(TenantScale.prototype.constructor.name).toBe('TenantScale')
  })

  it('exports error classes', async () => {
    const mod = await import('../types.ts')
    expect(mod.TenantScaleError).toBeDefined()
    expect(mod.AuthenticationError).toBeDefined()
    expect(mod.AuthorizationError).toBeDefined()
    expect(mod.PlanLimitExceededError).toBeDefined()
    expect(mod.RateLimitExceededError).toBeDefined()
    expect(mod.NotFoundError).toBeDefined()
    expect(mod.ConflictError).toBeDefined()
  })

  it('exports auth utilities', async () => {
    const mod = await import('../auth.ts')
    expect(mod.validateApiKey).toBeDefined()
    expect(mod.requireScope).toBeDefined()
    expect(mod.hasRequiredScope).toBeDefined()
  })

  it('exports API key utilities', async () => {
    const mod = await import('../api-key.ts')
    expect(mod.generateApiKey).toBeDefined()
    expect(mod.hashApiKey).toBeDefined()
    expect(mod.isValidApiKeyFormat).toBeDefined()
  })

  it('exports audit utilities', async () => {
    const mod = await import('../audit.ts')
    expect(mod.logAuditEvent).toBeDefined()
    expect(mod.getClientIp).toBeDefined()
  })

  it('exports plan store', async () => {
    const { PlanStore } = await import('../plan.ts')
    expect(PlanStore).toBeDefined()
  })

  it('exports rate limiter', async () => {
    const { RateLimiter } = await import('../rate-limit.ts')
    expect(RateLimiter).toBeDefined()
  })

  it('exports webhook dispatcher', async () => {
    const { WebhookDispatcher } = await import('../webhook.ts')
    expect(WebhookDispatcher).toBeDefined()
  })

  it('exports Stripe client', async () => {
    const { StripeClient } = await import('../stripe.ts')
    expect(StripeClient).toBeDefined()
  })

  it('exports pagination utilities', async () => {
    const mod = await import('../pagination.ts')
    expect(mod.parsePaginationParams).toBeDefined()
    expect(mod.paginationResponse).toBeDefined()
  })

  it('exports SSRF validation', async () => {
    const { validateWebhookUrl } = await import('../ssrf.ts')
    expect(validateWebhookUrl).toBeDefined()
  })

  it('exports session utilities', async () => {
    const mod = await import('../session.ts')
    expect(mod.validateSession).toBeDefined()
    expect(mod.requirePortalRole).toBeDefined()
    expect(mod.requireSuperAdmin).toBeDefined()
  })

  it('barrel index re-exports all public API', async () => {
    const mod = await import('../index.ts')
    // Main class
    expect(mod.TenantScale).toBeDefined()
    // Error classes
    expect(mod.AuthenticationError).toBeDefined()
    expect(mod.AuthorizationError).toBeDefined()
    // Utilities
    expect(mod.generateApiKey).toBeDefined()
    expect(mod.validateApiKey).toBeDefined()
    expect(mod.logAuditEvent).toBeDefined()
    expect(mod.parsePaginationParams).toBeDefined()
  })
})
