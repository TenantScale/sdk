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
// create-tenantscale-app — Scaffolding engine
// ──────────────────────────────────────────────────────

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('..', import.meta.url))
const TEMPLATES_DIR = join(__dirname, 'templates')

/**
 * Recursively copy template files to the target directory.
 * Files/dirs prefixed with `_` are renamed to drop the underscore
 * (e.g. `_gitignore` → `.gitignore`, `_env.example` → `.env.example`).
 */
export async function scaffold(targetDir: string, projectName: string): Promise<void> {
  copyRecursive(TEMPLATES_DIR, targetDir, projectName)
}

function copyRecursive(srcDir: string, destDir: string, projectName: string) {
  const entries = readdirSync(srcDir)

  for (const entry of entries) {
    const srcPath = join(srcDir, entry)
    const destName = entry.startsWith('_') ? '.' + entry.slice(1) : entry
    const destPath = join(destDir, destName)
    const stat = statSync(srcPath)

    if (stat.isDirectory()) {
      mkdirSync(destPath, { recursive: true })
      copyRecursive(srcPath, destPath, projectName)
    } else {
      let content = readFileSync(srcPath, 'utf-8')
      // Replace template variables
      content = content.replace(/\{\{projectName\}\}/g, projectName)
      writeFileSync(destPath, content, 'utf-8')
    }
  }
}
