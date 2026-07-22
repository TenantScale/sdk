import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
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
    return {
      stdout: (e && typeof e === 'object' && 'stdout' in e ? String((e as Record<string, unknown>).stdout ?? '') : '') +
              (e && typeof e === 'object' && 'stderr' in e ? String((e as Record<string, unknown>).stderr ?? '') : ''),
      exitCode: (e && typeof e === 'object' && 'status' in e ? (e as Record<string, unknown>).status as number : 1) ?? 1,
    }
  }
}

describe('CLI smoke tests', () => {
  it('CLI binary exists', () => {
    expect(existsSync(cliEntry)).toBe(true)
  })

  it('CLI runs without arguments and shows help', () => {
    const result = run('', __dirname)
    expect(result.stdout).toContain('Usage:')
    expect(result.stdout).toContain('tenantscale')
    expect(result.stdout).toContain('init')
  })

  it('CLI --help shows help text', () => {
    const result = run('--help', __dirname)
    expect(result.stdout).toContain('Usage:')
    expect(result.stdout).toContain('tenantscale')
    expect(result.stdout).toContain('init')
  })

  it('CLI --version outputs the version', () => {
    const result = run('--version', __dirname)
    const { version } = require('../../package.json')
    expect(result.stdout.trim()).toBe(version)
  })
})

describe('tenantscale init --non-interactive', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tscale-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates expected files in the project directory', () => {
    const projectDir = join(tmpDir, 'my-app')
    const result = run(`init ${projectDir} --non-interactive`, tmpDir)

    expect(result.stdout).toContain('SUCCESS')
    expect(result.stdout).toContain('Your TenantScale project is ready!')
    expect(result.stdout).toContain('Created')

    // Check files exist
    expect(existsSync(join(projectDir, '.env'))).toBe(true)
    expect(existsSync(join(projectDir, 'supabase', 'migrations'))).toBe(true)
    expect(existsSync(join(projectDir, 'templates', 'migration.sql'))).toBe(true)
    expect(existsSync(join(projectDir, 'package.json'))).toBe(true)

    // No middleware dir since default framework is "none"
    expect(existsSync(join(projectDir, 'src', 'middleware'))).toBe(false)

    // Check .env content
    const envContent = readFileSync(join(projectDir, '.env'), 'utf-8')
    expect(envContent).toContain('TENANTSCALE_API_KEY')
  })

  it('--framework hono creates hono middleware', () => {
    const projectDir = join(tmpDir, 'hono-app')
    const result = run(`init ${projectDir} --non-interactive --framework hono`, tmpDir)

    expect(result.stdout).toContain('SUCCESS')

    const middlewarePath = join(projectDir, 'src', 'middleware', 'tenant.ts')
    expect(existsSync(middlewarePath)).toBe(true)

    const middlewareContent = readFileSync(middlewarePath, 'utf-8')
    expect(middlewareContent).toContain('hono')
    expect(middlewareContent).toContain('createMiddleware')
    expect(middlewareContent).toContain('TenantScale')
    expect(middlewareContent).toContain('ContextVariableMap')
  })

  it('--framework express creates express middleware', () => {
    const projectDir = join(tmpDir, 'express-app')
    const result = run(`init ${projectDir} --non-interactive --framework express`, tmpDir)

    expect(result.stdout).toContain('SUCCESS')

    const middlewarePath = join(projectDir, 'src', 'middleware', 'tenant.ts')
    expect(existsSync(middlewarePath)).toBe(true)

    const middlewareContent = readFileSync(middlewarePath, 'utf-8')
    expect(middlewareContent).toContain('express')
    expect(middlewareContent).toContain('Request, Response, NextFunction')
    expect(middlewareContent).toContain('TenantScale')
    expect(middlewareContent).toContain('namespace Express')
  })

  it('--table option customizes the migration SQL', () => {
    const projectDir = join(tmpDir, 'custom-table')
    const result = run(`init ${projectDir} --non-interactive --table organizations`, tmpDir)

    expect(result.stdout).toContain('SUCCESS')

    // Check migration files
    const migrationsDir = join(projectDir, 'supabase', 'migrations')
    // Use readdirSync instead of fragile execSync('ls ...')
    const migrationFiles = readdirSync(migrationsDir)
    expect(migrationFiles.length).toBeGreaterThan(0)

    const migrationContent = readFileSync(join(migrationsDir, migrationFiles[0]), 'utf-8')
    expect(migrationContent).toContain('organizations')
  })
})
