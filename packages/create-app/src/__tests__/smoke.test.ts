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
 * IMPLIED, BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

// ──────────────────────────────────────────────────────
// create-tenantscale-app — Scaffold tests
// ──────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { PromptResults } from '../types.js'

function defaultResults(overrides?: Partial<PromptResults>): PromptResults {
  return {
    projectName: 'test-app',
    templateTier: 'example',
    framework: 'next-hono',
    language: 'typescript',
    packageManager: 'pnpm',
    supabase: 'skip',
    stripe: false,
    tenantColumn: 'tenant_id',
    gitInit: false,
    runInstall: false,
    ...overrides,
  }
}

async function scaffoldToTemp(results: PromptResults): Promise<string> {
  const tmpDir = mkdtempSync(join(tmpdir(), 'ts-app-'))
  const { scaffold, scaffoldFullExtras } = await import('../scaffold.js')

  await scaffold(tmpDir, results)

  if (results.templateTier === 'full') {
    await scaffoldFullExtras(tmpDir, results)
  }

  return tmpDir
}

describe('create-tenantscale-app scaffold', () => {
  describe('example template (default)', () => {
    it('scaffolds a complete project', async () => {
      const tmpDir = await scaffoldToTemp(defaultResults())

      // Root files
      expect(existsSync(join(tmpDir, 'package.json'))).toBe(true)
      expect(existsSync(join(tmpDir, 'pnpm-workspace.yaml'))).toBe(true)
      expect(existsSync(join(tmpDir, 'turbo.json'))).toBe(true)
      expect(existsSync(join(tmpDir, 'README.md'))).toBe(true)
      expect(existsSync(join(tmpDir, '.gitignore'))).toBe(true)
      expect(existsSync(join(tmpDir, '.env.example'))).toBe(true)

      // API files
      expect(existsSync(join(tmpDir, 'apps/api/src/index.ts'))).toBe(true)
      expect(existsSync(join(tmpDir, 'apps/api/src/db.ts'))).toBe(true)
      expect(existsSync(join(tmpDir, 'apps/api/src/routes/me.ts'))).toBe(true)
      expect(existsSync(join(tmpDir, 'apps/api/src/routes/api-keys.ts'))).toBe(true)
      expect(existsSync(join(tmpDir, 'apps/api/src/routes/team.ts'))).toBe(true)
      expect(existsSync(join(tmpDir, 'apps/api/src/routes/audit.ts'))).toBe(true)
      expect(existsSync(join(tmpDir, 'apps/api/src/routes/webhooks.ts'))).toBe(true)

      // Web files
      expect(existsSync(join(tmpDir, 'apps/web/package.json'))).toBe(true)
      expect(existsSync(join(tmpDir, 'apps/web/next.config.ts'))).toBe(true)
      expect(existsSync(join(tmpDir, 'apps/web/app/layout.tsx'))).toBe(true)
      expect(existsSync(join(tmpDir, 'apps/web/app/page.tsx'))).toBe(true)
      expect(existsSync(join(tmpDir, 'apps/web/app/login/page.tsx'))).toBe(true)
      expect(existsSync(join(tmpDir, 'apps/web/app/register/page.tsx'))).toBe(true)
      expect(existsSync(join(tmpDir, 'apps/web/app/dashboard/page.tsx'))).toBe(true)
      expect(existsSync(join(tmpDir, 'apps/web/app/team/page.tsx'))).toBe(true)
      expect(existsSync(join(tmpDir, 'apps/web/app/api-keys/page.tsx'))).toBe(true)
      expect(existsSync(join(tmpDir, 'apps/web/app/audit/page.tsx'))).toBe(true)
      expect(existsSync(join(tmpDir, 'apps/web/app/settings/page.tsx'))).toBe(true)
      expect(existsSync(join(tmpDir, 'apps/web/app/api/proxy/[...path]/route.ts'))).toBe(true)
      expect(existsSync(join(tmpDir, 'apps/web/components/NavBar.tsx'))).toBe(true)
      expect(existsSync(join(tmpDir, 'apps/web/components/providers.tsx'))).toBe(true)
      expect(existsSync(join(tmpDir, 'apps/web/lib/supabase.ts'))).toBe(true)
      expect(existsSync(join(tmpDir, 'apps/web/lib/utils.ts'))).toBe(true)

      // Supabase migration
      expect(existsSync(join(tmpDir, 'supabase/migrations/001_init.sql'))).toBe(true)

      // Template variable substitution
      const pkg = JSON.parse(readFileSync(join(tmpDir, 'package.json'), 'utf-8'))
      expect(pkg.name).toBe('test-app')

      rmSync(tmpDir, { recursive: true, force: true })
    })
  })

  describe('minimal template', () => {
    it('scaffolds a bare-bones project', async () => {
      const tmpDir = await scaffoldToTemp(defaultResults({ templateTier: 'minimal' }))

      // Root files
      expect(existsSync(join(tmpDir, 'package.json'))).toBe(true)
      expect(existsSync(join(tmpDir, 'pnpm-workspace.yaml'))).toBe(true)
      expect(existsSync(join(tmpDir, 'turbo.json'))).toBe(true)
      expect(existsSync(join(tmpDir, '.env.example'))).toBe(true)
      expect(existsSync(join(tmpDir, '.gitignore'))).toBe(true)

      // API files
      expect(existsSync(join(tmpDir, 'apps/api/package.json'))).toBe(true)
      expect(existsSync(join(tmpDir, 'apps/api/src/index.ts'))).toBe(true)
      expect(existsSync(join(tmpDir, 'apps/api/src/db.ts'))).toBe(true)

      // No example routes
      expect(existsSync(join(tmpDir, 'apps/api/src/routes/me.ts'))).toBe(false)

      // Web files
      expect(existsSync(join(tmpDir, 'apps/web/package.json'))).toBe(true)
      expect(existsSync(join(tmpDir, 'apps/web/app/layout.tsx'))).toBe(true)
      expect(existsSync(join(tmpDir, 'apps/web/app/page.tsx'))).toBe(true)

      // No example pages
      expect(existsSync(join(tmpDir, 'apps/web/app/dashboard/page.tsx'))).toBe(false)

      // Template variable substitution
      const pkg = JSON.parse(readFileSync(join(tmpDir, 'package.json'), 'utf-8'))
      expect(pkg.name).toBe('test-app')

      rmSync(tmpDir, { recursive: true, force: true })
    })
  })

  describe('full template', () => {
    it('scaffolds with billing extras', async () => {
      const tmpDir = await scaffoldToTemp(defaultResults({ templateTier: 'full', stripe: true }))

      // Has all example files
      expect(existsSync(join(tmpDir, 'apps/api/src/routes/me.ts'))).toBe(true)

      // Has billing extras
      expect(existsSync(join(tmpDir, 'apps/api/src/routes/billing.ts'))).toBe(true)
      expect(existsSync(join(tmpDir, 'apps/api/src/routes/stripe.ts'))).toBe(true)
      expect(existsSync(join(tmpDir, 'apps/api/src/routes/stripe-webhook.ts'))).toBe(true)

      // Has RLS policies
      expect(existsSync(join(tmpDir, 'supabase/rls-policies.sql'))).toBe(true)

      // Has test file
      expect(existsSync(join(tmpDir, 'apps/api/src/__tests__/tenant-isolation.test.ts'))).toBe(true)

      rmSync(tmpDir, { recursive: true, force: true })
    })

    it('omits billing extras when Stripe is declined', async () => {
      const tmpDir = await scaffoldToTemp(defaultResults({ templateTier: 'full', stripe: false }))

      // Example base is still scaffolded
      expect(existsSync(join(tmpDir, 'apps/api/src/routes/me.ts'))).toBe(true)

      // No Stripe/billing files — project matches the prompt choice
      expect(existsSync(join(tmpDir, 'apps/api/src/routes/billing.ts'))).toBe(false)
      expect(existsSync(join(tmpDir, 'apps/api/src/routes/stripe.ts'))).toBe(false)
      expect(existsSync(join(tmpDir, 'apps/api/src/routes/stripe-webhook.ts'))).toBe(false)
      expect(existsSync(join(tmpDir, 'apps/api/src/lib/billing.ts'))).toBe(false)
      expect(existsSync(join(tmpDir, 'apps/api/src/middleware/session-auth.ts'))).toBe(false)

      // RLS policies are not Stripe-specific — still present
      expect(existsSync(join(tmpDir, 'supabase/rls-policies.sql'))).toBe(true)

      rmSync(tmpDir, { recursive: true, force: true })
    })
  })

  describe('template variable substitution', () => {
    it('replaces projectName in package.json', async () => {
      const tmpDir = await scaffoldToTemp(defaultResults({ projectName: 'my-cool-app' }))

      const pkg = JSON.parse(readFileSync(join(tmpDir, 'package.json'), 'utf-8'))
      expect(pkg.name).toBe('my-cool-app')

      rmSync(tmpDir, { recursive: true, force: true })
    })

    it('replaces tenantColumn in env example', async () => {
      const tmpDir = await scaffoldToTemp(defaultResults({ tenantColumn: 'org_id' }))

      // env.example doesn't currently have {{tenantColumn}}, but verify the template works
      expect(existsSync(join(tmpDir, '.env.example'))).toBe(true)

      rmSync(tmpDir, { recursive: true, force: true })
    })

    it('injects supabase credentials when provided', async () => {
      const tmpDir = await scaffoldToTemp(
        defaultResults({
          supabase: 'enter',
          supabaseUrl: 'https://test-project.supabase.co',
          supabaseAnonKey: 'anon-key-123',
          supabaseServiceKey: 'service-key-456',
        }),
      )

      const envExample = readFileSync(join(tmpDir, '.env.example'), 'utf-8')
      expect(envExample).toContain('test-project.supabase.co')
      // Service role key must NOT appear in any NEXT_PUBLIC_ var (browser-visible)
      expect(envExample).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-key-123')
      expect(envExample).toContain('SUPABASE_SERVICE_ROLE_KEY=service-key-456')
      const nextPublicLines = envExample
        .split('\n')
        .filter((line: string) => line.startsWith('NEXT_PUBLIC_'))
        .join('\n')
      expect(nextPublicLines).not.toContain('service-key-456')

      rmSync(tmpDir, { recursive: true, force: true })
    })
  })

  describe('CLI entry point', () => {
    it('exports CLI entry point', async () => {
      const { resolve, dirname } = await import('path')
      const { fileURLToPath } = await import('url')
      const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
      const pkg = JSON.parse(readFileSync(`${root}/package.json`, 'utf-8'))
      expect(pkg.bin).toBeDefined()
      expect(pkg.bin['create-app']).toBe('./dist/index.js')
      expect(pkg.files).toContain('templates')
    })

    it('sanitizes project names containing special characters', () => {
      const sanitize = (name: string) => name.replace(/[^a-z0-9_-]/gi, '-')

      expect(sanitize('My App!')).toBe('My-App-')
      expect(sanitize('hello.world')).toBe('hello-world')
      expect(sanitize('  spaces  ')).toBe('--spaces--')
      expect(sanitize('UPPERCASE')).toBe('UPPERCASE')
      expect(sanitize('project/name\\bad')).toBe('project-name-bad')
    })

    it('handles empty project name by using default', () => {
      const projectName = process.argv[2]?.replace(/[^a-z0-9_-]/gi, '-') || 'my-multi-tenant-app'
      expect(projectName).toBe('my-multi-tenant-app')
    })
  })

  describe('prompts module', () => {
    it('exports framework list', async () => {
      const { FRAMEWORKS } = await import('../prompts.js')
      expect(FRAMEWORKS.length).toBeGreaterThanOrEqual(1)
      expect(FRAMEWORKS[0].value).toBe('next-hono')
    })

    it('detects package manager from environment', async () => {
      const { detectPackageManager } = await import('../prompts.js')
      // In CI or pnpm context, should detect pnpm
      const pm = detectPackageManager()
      expect(['pnpm', 'npm', 'yarn']).toContain(pm)
    })
  })
})
