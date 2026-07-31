#!/usr/bin/env node

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
// create-tenantscale-app — CLI entry point
// ──────────────────────────────────────────────────────

import { existsSync, mkdirSync, readdirSync } from 'fs'
import { resolve } from 'path'
import { runPrompts } from './prompts.js'
import { scaffold, scaffoldFullExtras } from './scaffold.js'
import { runPostScaffold } from './post-scaffold/index.js'
import type { PromptResults } from './types.js'

async function main() {
  const defaultName = process.argv[2]?.replace(/[^a-z0-9_-]/gi, '-') || 'my-multi-tenant-app'

  // ── Interactive prompts ──
  const results = await runPrompts(defaultName)

  // Compute targetDir from the FINAL project name (user may have changed it
  // during prompts — scaffolding into the argv-derived name would diverge).
  const targetDir = resolve(process.cwd(), results.projectName)

  // ── Check if target directory already exists ──
  if (existsSync(targetDir) && readdirNotEmpty(targetDir)) {
    console.error(`\n  ✖ Directory already exists: ${results.projectName}`)
    console.error('  Choose a different name or delete the directory.\n')
    process.exit(1)
  }

  const promptResults: PromptResults & { targetDir: string } = {
    ...results,
    targetDir,
  }

  // ── Scaffold ──
  mkdirSync(targetDir, { recursive: true })
  console.log()

  try {
    await scaffold(targetDir, promptResults)

    // For full template, layer extras on top
    if (results.templateTier === 'full') {
      await scaffoldFullExtras(targetDir, promptResults)
    }
  } catch (err) {
    console.error(`\n  ✖ ${err instanceof Error ? err.message : 'Scaffold failed'}\n`)
    process.exit(1)
  }

  // ── Post-scaffold ──
  await runPostScaffold(promptResults)
}

function readdirNotEmpty(dir: string): boolean {
  try {
    return readdirSync(dir).length > 0
  } catch {
    return false
  }
}

main().catch((err) => {
  console.error(`\n  ✖ Unexpected error: ${err instanceof Error ? err.message : err}\n`)
  process.exit(1)
})
