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
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
// ──────────────────────────────────────────────────────
// create-tenantscale-app — CLI entry point
// ──────────────────────────────────────────────────────

import { existsSync, mkdirSync } from 'fs'
import { resolve } from 'path'
import { scaffold } from './scaffold.js'

const projectName = process.argv[2]?.replace(/[^a-z0-9_-]/gi, '-') || 'my-multi-tenant-app'
const targetDir = resolve(process.cwd(), projectName)

if (existsSync(targetDir)) {
  console.error(`\n  ✖ Directory already exists: ${projectName}`)
  console.error('  Choose a different name or delete the directory.\n')
  process.exit(1)
}

mkdirSync(targetDir, { recursive: true })

console.log(`\n  ◆  Creating TenantScale app: ${projectName}`)
console.log()

await scaffold(targetDir, projectName)

console.log(`\n  ◆  Done! Scaffolded at: ${targetDir}`)
console.log()
console.log('  Next steps:')
console.log(`    cd ${projectName}`)
console.log('    cp .env.example .env.local        # Add your Supabase credentials')
console.log('    pnpm install')
console.log('    pnpm dev')
console.log()
