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
// create-tenantscale-app — Scaffolding engine
// ──────────────────────────────────────────────────────

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  rmSync,
  existsSync,
} from 'fs'
import { join, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import type { PromptResults } from './types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Walk up from dist/ or src/ to find the package root with templates/
const TEMPLATES_ROOT = findTemplatesRoot()

function findTemplatesRoot(): string {
  let dir = resolve(__dirname)
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'templates'))) return join(dir, 'templates')
    dir = resolve(dir, '..')
    // Stop at filesystem root
    if (dir === resolve(dir, '..')) break
  }
  // Fallback — should work in both src/ and dist/ setups
  return join(__dirname, '..', 'templates')
}

/**
 * Template variable substitutions applied to every file.
 */
export interface TemplateVars {
  projectName: string
  tenantColumn: string
  supabaseUrl: string
  supabaseAnonKey: string
  supabaseServiceKey: string
  stripeSecretKey: string
  framework: string
  language: string
}

/**
 * Resolve the template directory for a given tier and framework.
 * Template structure: templates/<tier>/<framework>/
 */
function resolveTemplateDir(tier: string, framework: string): string {
  return join(TEMPLATES_ROOT, tier, framework)
}

/**
 * Scaffold a project from the selected template into targetDir.
 * On any failure during scaffold, the target directory is cleaned up.
 */
export async function scaffold(targetDir: string, results: PromptResults): Promise<void> {
  const { templateTier, framework } = results

  // Minimal uses its own template; example and full share the example template as base
  const baseTier = templateTier === 'minimal' ? 'minimal' : 'example'
  const templateDir = resolveTemplateDir(baseTier, framework)

  // Verify template exists
  try {
    statSync(templateDir)
  } catch {
    // Fall back to example tier if requested tier doesn't have this framework
    const fallbackDir = resolveTemplateDir('example', framework)
    try {
      statSync(fallbackDir)
    } catch {
      throw new Error(
        `No template found for ${templateTier}/${framework}. Try 'example/next-hono'.`,
      )
    }
    throw new Error(
      `Template '${templateTier}/${framework}' not available yet. 'example/next-hono' exists.`,
    )
  }

  // Build template variables
  const vars: TemplateVars = buildVars(results)

  try {
    copyRecursive(templateDir, targetDir, vars)
  } catch (err) {
    // Rollback on failure
    cleanup(targetDir)
    throw new Error(`Scaffold failed: ${err instanceof Error ? err.message : err}`)
  }
}

/**
 * If the full tier was selected, layer extra files on top of the example scaffold.
 */
export async function scaffoldFullExtras(targetDir: string, results: PromptResults): Promise<void> {
  if (results.templateTier !== 'full') return

  const fullDir = resolveTemplateDir('full', results.framework)
  try {
    statSync(fullDir)
  } catch {
    // No full extras for this framework yet — that's ok
    return
  }

  const vars: TemplateVars = buildVars(results)

  // When the user opted out of Stripe, skip billing files entirely so the
  // generated project matches what the prompts promised (no dead billing
  // routes, no unmounted imports).
  const exclude = !results.stripe
    ? [
        'apps/api/src/index.ts',
        'apps/api/src/routes/billing.ts',
        'apps/api/src/routes/stripe.ts',
        'apps/api/src/routes/stripe-webhook.ts',
        'apps/api/src/lib/billing.ts',
        'apps/api/src/middleware/session-auth.ts',
      ]
    : []

  try {
    copyRecursive(fullDir, targetDir, vars, exclude)
  } catch (err) {
    cleanup(targetDir)
    throw new Error(`Full template extras failed: ${err instanceof Error ? err.message : err}`)
  }
}

function buildVars(results: PromptResults): TemplateVars {
  const {
    projectName,
    supabase,
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceKey,
    stripe,
    stripeKey,
    tenantColumn,
    framework,
    language,
  } = results

  const hasSupabaseUrl =
    supabase === 'enter' && typeof supabaseUrl === 'string' && supabaseUrl.length > 0
  const hasSupabaseAnonKey =
    supabase === 'enter' && typeof supabaseAnonKey === 'string' && supabaseAnonKey.length > 0
  const hasSupabaseServiceKey =
    supabase === 'enter' && typeof supabaseServiceKey === 'string' && supabaseServiceKey.length > 0
  const hasStripeKey = stripe && typeof stripeKey === 'string' && stripeKey.length > 0

  return {
    projectName,
    tenantColumn: tenantColumn || 'tenant_id',
    supabaseUrl: hasSupabaseUrl ? (supabaseUrl as string) : 'https://your-project.supabase.co',
    supabaseAnonKey: hasSupabaseAnonKey ? (supabaseAnonKey as string) : 'your-anon-key',
    supabaseServiceKey: hasSupabaseServiceKey
      ? (supabaseServiceKey as string)
      : 'your-service-role-key',
    stripeSecretKey: hasStripeKey ? (stripeKey as string) : 'sk_tes..._key',
    framework,
    language,
  }
}

function copyRecursive(
  srcDir: string,
  destDir: string,
  vars: TemplateVars,
  exclude: string[] = [],
  relPrefix = '',
) {
  // Allow template dir to not exist (e.g. full extras for a new framework)
  try {
    statSync(srcDir)
  } catch {
    return
  }

  const entries = readdirSync(srcDir)

  for (const entry of entries) {
    const srcPath = join(srcDir, entry)
    const relPath = relPrefix ? `${relPrefix}/${entry}` : entry

    // Skip dotfiles that should be handled by _ prefix convention
    if (entry.startsWith('.') && !entry.startsWith('_')) continue

    // Skip excluded relative paths (used to gate optional features)
    if (exclude.includes(relPath)) continue

    // Rename _prefix to dotfile: _gitignore → .gitignore, _env.example → .env.example
    // but preserve double-underscore prefixes like __tests__
    const destName = entry.startsWith('_') && !entry.startsWith('__') ? '.' + entry.slice(1) : entry
    const destPath = join(destDir, destName)
    const stat = statSync(srcPath)

    if (stat.isDirectory()) {
      mkdirSync(destPath, { recursive: true })
      copyRecursive(srcPath, destPath, vars, exclude, relPath)
    } else {
      let content = readFileSync(srcPath, 'utf-8')
      content = interpolate(content, vars)
      mkdirSync(dirname(destPath), { recursive: true })
      writeFileSync(destPath, content, 'utf-8')
    }
  }
}

/**
 * Replace all {{variable}} placeholders with actual values.
 * Unknown placeholders are left as-is (no silent stripping).
 */
function interpolate(content: string, vars: TemplateVars): string {
  return content
    .replace(/\{\{projectName\}\}/g, escapeShell(vars.projectName))
    .replace(/\{\{tenantColumn\}\}/g, vars.tenantColumn)
    .replace(/\{\{supabaseUrl\}\}/g, vars.supabaseUrl)
    .replace(/\{\{supabaseAnonKey\}\}/g, vars.supabaseAnonKey)
    .replace(/\{\{supabaseServiceKey\}\}/g, vars.supabaseServiceKey)
    .replace(/\{\{stripeSecretKey\}\}/g, vars.stripeSecretKey)
    .replace(/\{\{framework\}\}/g, vars.framework)
    .replace(/\{\{language\}\}/g, vars.language)
}

function escapeShell(str: string): string {
  // Basic sanitization for project names used in package.json etc.
  return str.replace(/[^a-z0-9_-]/gi, '-')
}

/**
 * Remove the target directory on failure.
 */
function cleanup(dir: string) {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    // Best effort
  }
}
