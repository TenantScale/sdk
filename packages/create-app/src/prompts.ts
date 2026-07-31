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
// create-tenantscale-app — Interactive prompts
// ──────────────────────────────────────────────────────

import * as p from '@clack/prompts'
import type { PromptResults } from './types.js'

/**
 * Known framework options with display labels and template directory keys.
 * Add new entries here to support more frameworks.
 */
export const FRAMEWORKS: { value: string; label: string; hint?: string }[] = [
  {
    value: 'next-hono',
    label: 'Next.js + Hono',
    hint: 'Full-stack — Next.js frontend with Hono API',
  },
]

/**
 * Run the interactive prompt flow.
 * Falls back to defaults when `process.stdin` is not a TTY (CI mode).
 */
export async function runPrompts(defaultProjectName: string): Promise<PromptResults> {
  const isInteractive = process.stdin.isTTY === true

  // ── Welcome ──
  if (isInteractive) {
    p.intro("Let's scaffold your TenantScale app")
  }

  const projectName = isInteractive ? await askProjectName(defaultProjectName) : defaultProjectName

  const templateTier = isInteractive ? await askTemplateTier() : 'example'

  const framework = isInteractive ? await askFramework() : 'next-hono'

  const language = isInteractive ? await askLanguage() : 'typescript'

  const packageManager = isInteractive ? await askPackageManager() : detectPackageManager()

  const tenantColumn = isInteractive ? await askTenantColumn() : 'tenant_id'

  const supabase = isInteractive ? await askSupabase() : 'skip'

  let supabaseUrl: string | undefined
  let supabaseAnonKey: string | undefined
  let supabaseServiceKey: string | undefined

  if (supabase === 'enter') {
    supabaseUrl = await askSupabaseUrl()
    supabaseAnonKey = await askSupabaseAnonKey()
    supabaseServiceKey = await askSupabaseServiceKey()
  }

  // Only ask about Stripe for non-minimal templates
  let stripe = false
  let stripeKey: string | undefined

  if (templateTier !== 'minimal' && isInteractive) {
    stripe = await askStripeOptIn()
    if (stripe) {
      stripeKey = await askStripeKey()
    }
  }

  const gitInit = isInteractive ? await askGitInit() : true

  const runInstall = isInteractive ? await askRunInstall() : true

  if (isInteractive) {
    p.outro('All set! Scaffolding your project...')
  }

  return {
    projectName,
    templateTier,
    framework,
    language,
    packageManager,
    supabase,
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceKey,
    stripe,
    stripeKey,
    tenantColumn,
    gitInit,
    runInstall,
  }
}

async function askProjectName(defaultName: string): Promise<string> {
  const result = await p.text({
    message: 'What is your project name?',
    placeholder: defaultName,
    defaultValue: defaultName,
    validate(value) {
      if (!value || value.trim().length === 0) return 'Project name is required'
      if (!/^[a-z0-9_-]+$/i.test(value.trim()))
        return 'Use only letters, numbers, hyphens, and underscores'
      return
    },
  })
  if (p.isCancel(result)) process.exit(0)
  return (result as string).trim()
}

async function askTemplateTier(): Promise<'minimal' | 'example' | 'full'> {
  const result = await p.select({
    message: 'Which template would you like to start from?',
    options: [
      {
        value: 'minimal',
        label: 'Minimal',
        hint: 'Bare scaffold — just TenantScale setup, no example code',
      },
      {
        value: 'example',
        label: 'Example',
        hint: 'Working multi-tenant API routes and dashboard pages',
      },
      {
        value: 'full',
        label: 'Full Demo',
        hint: 'Example + Stripe billing, Portal integration, RLS policies',
      },
    ],
  })
  if (p.isCancel(result)) process.exit(0)
  return result as 'minimal' | 'example' | 'full'
}

async function askFramework(): Promise<string> {
  const result = await p.select({
    message: 'Which framework?',
    options: FRAMEWORKS,
  })
  if (p.isCancel(result)) process.exit(0)
  return result as string
}

async function askLanguage(): Promise<'typescript' | 'javascript'> {
  const result = await p.select({
    message: 'TypeScript or JavaScript?',
    initialValue: 'typescript',
    options: [
      { value: 'typescript', label: 'TypeScript' },
      { value: 'javascript', label: 'JavaScript' },
    ],
  })
  if (p.isCancel(result)) process.exit(0)
  return result as 'typescript' | 'javascript'
}

async function askPackageManager(): Promise<'pnpm' | 'npm' | 'yarn'> {
  const result = await p.select({
    message: 'Which package manager?',
    initialValue: 'pnpm',
    options: [
      { value: 'pnpm', label: 'pnpm', hint: 'recommended' },
      { value: 'npm', label: 'npm' },
      { value: 'yarn', label: 'yarn' },
    ],
  })
  if (p.isCancel(result)) process.exit(0)
  return result as 'pnpm' | 'npm' | 'yarn'
}

async function askTenantColumn(): Promise<string> {
  const result = await p.text({
    message: 'What is your tenant column name?',
    placeholder: 'tenant_id',
    defaultValue: 'tenant_id',
    validate(value) {
      if (!value || value.trim().length === 0) return 'Column name is required'
      if (!/^[a-z_][a-z0-9_]*$/i.test(value.trim()))
        return 'Must be a valid column name (letters, underscores)'
      return
    },
  })
  if (p.isCancel(result)) process.exit(0)
  return (result as string).trim()
}

async function askSupabase(): Promise<'skip' | 'enter'> {
  const result = await p.select({
    message: 'Do you want to configure Supabase now?',
    options: [
      { value: 'skip', label: 'Skip for now', hint: 'You can add credentials later' },
      { value: 'enter', label: 'Enter credentials', hint: 'URL and anon/service key' },
    ],
  })
  if (p.isCancel(result)) process.exit(0)
  return result as 'skip' | 'enter'
}

async function askSupabaseUrl(): Promise<string> {
  const result = await p.password({
    message: 'Supabase project URL',
    validate(value) {
      if (!value || value.trim().length === 0) return 'Supabase URL is required'
      if (!value.startsWith('https://')) return 'Must be a valid HTTPS URL'
      return
    },
  })
  if (p.isCancel(result)) process.exit(0)
  return (result as string).trim()
}

async function askSupabaseAnonKey(): Promise<string> {
  const result = await p.password({
    message: 'Supabase anon (public) key',
    validate(value) {
      if (!value || value.trim().length === 0) return 'Anon key is required'
      return
    },
  })
  if (p.isCancel(result)) process.exit(0)
  return (result as string).trim()
}

async function askSupabaseServiceKey(): Promise<string> {
  const result = await p.password({
    message: 'Supabase service role key (server-only — never expose this)',
    validate(value) {
      if (!value || value.trim().length === 0) return 'Service role key is required'
      return
    },
  })
  if (p.isCancel(result)) process.exit(0)
  return (result as string).trim()
}

async function askStripeOptIn(): Promise<boolean> {
  const result = await p.confirm({
    message: 'Include Stripe billing integration?',
    initialValue: false,
  })
  if (p.isCancel(result)) process.exit(0)
  return result as boolean
}

async function askStripeKey(): Promise<string> {
  const result = await p.password({
    message: 'Stripe secret key (optional — can be added later)',
    validate(value) {
      if (value && value.trim().length > 0 && !value.startsWith('sk_')) return 'Must start with sk_'
      return
    },
  })
  if (p.isCancel(result)) process.exit(0)
  return (result as string).trim()
}

async function askGitInit(): Promise<boolean> {
  const result = await p.confirm({
    message: 'Initialize a git repository?',
    initialValue: true,
  })
  if (p.isCancel(result)) process.exit(0)
  return result as boolean
}

async function askRunInstall(): Promise<boolean> {
  const result = await p.confirm({
    message: 'Install dependencies now?',
    initialValue: true,
  })
  if (p.isCancel(result)) process.exit(0)
  return result as boolean
}

/**
 * Detect available package manager from the environment.
 */
export function detectPackageManager(): 'pnpm' | 'npm' | 'yarn' {
  // Respect corepack / npm_config_user_agent
  const userAgent = process.env.npm_config_user_agent ?? ''
  if (userAgent.includes('pnpm')) return 'pnpm'
  if (userAgent.includes('yarn')) return 'yarn'
  return 'npm'
}
