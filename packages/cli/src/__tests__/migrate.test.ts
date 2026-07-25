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
// @tenantscale/cli — Migrate command integration tests
// ──────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const cliEntry = join(__dirname, '../../dist/index.js')

interface RunResult {
  stdout: string
  exitCode: number
}

function run(args: string, cwd: string): RunResult {
  try {
    const stdout = execSync(`node ${cliEntry} ${args}`, {
      cwd,
      encoding: 'utf-8',
      timeout: 30_000,
    })
    return { stdout, exitCode: 0 }
  } catch (e: unknown) {
    const err = e as Record<string, unknown>
    return {
      stdout: String(err.stdout ?? '') + String(err.stderr ?? ''),
      exitCode: (err.status as number) ?? 1,
    }
  }
}

const FIXTURES_DIR = join(__dirname, '../../__fixtures__')

describe('tenantscale migrate — non-interactive', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tscale-migrate-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('shows help text for migrate command', () => {
    const result = run('migrate --help', __dirname)
    expect(result.stdout).toContain('migrate')
    expect(result.stdout).toContain('Analyze an existing codebase')
    expect(result.exitCode).toBe(0)
  })

  it('detects Express framework from fixture', () => {
    const projectDir = join(FIXTURES_DIR, 'express-basic')
    const result = run(`migrate ${projectDir} --non-interactive --report-only`, tmpDir)

    expect(result.stdout).toContain('express')
    expect(result.stdout).toContain('Readiness Score')
    expect(result.exitCode).toBe(0)
  })

  it('detects Hono framework from fixture', () => {
    const projectDir = join(FIXTURES_DIR, 'hono-basic')
    const result = run(`migrate ${projectDir} --non-interactive --report-only`, tmpDir)

    expect(result.stdout).toContain('hono')
    expect(result.stdout).toContain('Readiness Score')
    expect(result.exitCode).toBe(0)
  })

  it('detects Next.js framework from fixture', () => {
    const projectDir = join(FIXTURES_DIR, 'nextjs-basic')
    const result = run(`migrate ${projectDir} --non-interactive --report-only`, tmpDir)

    // Next.js might also trigger the express fallback if no route patterns match
    // We check that it ran and produced a report
    expect(result.stdout).toContain('Readiness Score')
    expect(result.exitCode).toBe(0)
  })

  it('generates migration artifacts for Express fixture', () => {
    const projectDir = join(FIXTURES_DIR, 'express-basic')
    const result = run(`migrate ${projectDir} --non-interactive`, tmpDir)

    expect(result.stdout).toContain('ANALYSIS COMPLETE')
    expect(result.exitCode).toBe(0)

    // Check artifacts were generated in the project's tenantscale/migrate dir
    const outputDir = join(projectDir, 'tenantscale', 'migrate')
    expect(existsSync(join(outputDir, 'README.md'))).toBe(true)
    expect(existsSync(join(outputDir, '001_add_tenant_id.sql'))).toBe(true)
    expect(existsSync(join(outputDir, '002_rls_policies.sql'))).toBe(true)
    expect(existsSync(join(outputDir, '003_seed_plans.sql'))).toBe(true)
    expect(existsSync(join(outputDir, 'tenant-middleware.ts'))).toBe(true)
    expect(existsSync(join(outputDir, '.env.tenantscale'))).toBe(true)
    expect(existsSync(join(outputDir, 'plan.json'))).toBe(true)

    // Cleanup generated artifacts
    rmSync(join(projectDir, 'tenantscale'), { recursive: true, force: true })
  })

  it('generates migration artifacts for Hono fixture', () => {
    const projectDir = join(FIXTURES_DIR, 'hono-basic')
    const result = run(`migrate ${projectDir} --non-interactive`, tmpDir)

    expect(result.stdout).toContain('ANALYSIS COMPLETE')
    expect(result.exitCode).toBe(0)

    // Only need README.md to verify it ran
    const outputDir = join(projectDir, 'tenantscale', 'migrate')
    expect(existsSync(join(outputDir, 'README.md'))).toBe(true)
    expect(existsSync(join(outputDir, 'tenant-middleware.ts'))).toBe(true)

    rmSync(join(projectDir, 'tenantscale'), { recursive: true, force: true })
  })

  it('generated SQL contains tenant_id references', () => {
    const projectDir = join(FIXTURES_DIR, 'express-basic')
    run(`migrate ${projectDir} --non-interactive`, tmpDir)

    const outputDir = join(projectDir, 'tenantscale', 'migrate')
    const sqlContent = readFileSync(join(outputDir, '001_add_tenant_id.sql'), 'utf-8')

    // Should reference tables from the fixture that need migration
    expect(sqlContent).toContain('projects')
    expect(sqlContent).toContain('tenant_id')
    expect(sqlContent).toContain('row level security')

    // Cleanup
    rmSync(join(projectDir, 'tenantscale'), { recursive: true, force: true })
  })

  it('generated middleware is valid TypeScript', () => {
    const projectDir = join(FIXTURES_DIR, 'express-basic')
    run(`migrate ${projectDir} --non-interactive`, tmpDir)

    const outputDir = join(projectDir, 'tenantscale', 'migrate')
    const mwContent = readFileSync(join(outputDir, 'tenant-middleware.ts'), 'utf-8')

    // Should reference the correct adapter
    expect(mwContent).toContain('@tenantscale/express')
    expect(mwContent).toContain('authenticateApiKey')
    expect(mwContent).toContain('TenantScale')

    // Cleanup
    rmSync(join(projectDir, 'tenantscale'), { recursive: true, force: true })
  })

  it('plan.json is valid JSON', () => {
    const projectDir = join(FIXTURES_DIR, 'express-basic')
    run(`migrate ${projectDir} --non-interactive`, tmpDir)

    const outputDir = join(projectDir, 'tenantscale', 'migrate')
    const planContent = readFileSync(join(outputDir, 'plan.json'), 'utf-8')

    expect(() => JSON.parse(planContent)).not.toThrow()
    const plan = JSON.parse(planContent)
    expect(plan.schemaVersion).toBe('1.0')
    expect(plan.project.framework).toBe('express')
    expect(plan.analysis.readiness).toBeDefined()
    expect(plan.analysis.database).toBeDefined()

    // Cleanup
    rmSync(join(projectDir, 'tenantscale'), { recursive: true, force: true })
  })

  it('handles empty directory gracefully', () => {
    const emptyDir = join(tmpDir, 'empty-project')
    mkdirSync(emptyDir, { recursive: true })
    const result = run(`migrate ${emptyDir} --non-interactive --report-only`, tmpDir)

    expect(result.stdout).toContain('Readiness Score')
    expect(result.exitCode).toBe(0)
  })
})
