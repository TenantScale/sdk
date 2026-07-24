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
// @tenantscale/cli — File globbing utilities
// ──────────────────────────────────────────────────────

import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export interface GlobOptions {
  /** File extensions to match (e.g. ['.ts', '.js']) */
  extensions?: string[]
  /** Specific filenames to match (e.g. ['package.json']) */
  filenames?: string[]
  /** Max depth to recurse (default: 10) */
  maxDepth?: number
  /** Ignore patterns (applied to basename) */
  ignore?: string[]
}

const DEFAULT_IGNORE = ['node_modules', '.git', '.turbo', 'dist', '.next', 'coverage', '.gitignore']

/**
 * Recursively find files matching given extensions or filenames.
 * Respects .gitignore patterns via DEFAULT_IGNORE.
 */
export function findFiles(dir: string, options: GlobOptions = {}): string[] {
  const { extensions = [], filenames = [], maxDepth = 10, ignore = DEFAULT_IGNORE } = options

  const results: string[] = []

  function walk(current: string, depth: number) {
    if (depth > maxDepth) return

    let entries: string[]
    try {
      entries = readdirSync(current)
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = join(current, entry)
      const basename = entry

      // Skip ignored directories/files
      if (ignore.some((p) => basename === p || basename.startsWith(p))) continue

      let stats: ReturnType<typeof statSync>
      try {
        stats = statSync(fullPath)
      } catch {
        continue
      }

      if (stats.isDirectory()) {
        walk(fullPath, depth + 1)
      } else if (stats.isFile()) {
        const ext = '.' + basename.split('.').pop()
        // Match by extension
        if (extensions.length > 0 && extensions.includes(ext)) {
          results.push(fullPath)
        }
        // Match by exact filename
        if (filenames.length > 0 && filenames.includes(basename)) {
          results.push(fullPath)
        }
      }
    }
  }

  walk(resolve(dir), 0)
  return results
}

/**
 * Find all source files (.ts, .js, .tsx, .jsx) in a directory.
 */
export function findSourceFiles(dir: string): string[] {
  return findFiles(dir, {
    extensions: ['.ts', '.js', '.tsx', '.jsx'],
  })
}

/**
 * Find all SQL migration files in a directory.
 */
export function findSqlFiles(dir: string): string[] {
  return findFiles(dir, {
    extensions: ['.sql'],
    filenames: [],
  })
}

/**
 * Read file content, returning null if it can't be read.
 */
export function readFileSafe(filePath: string): string | null {
  try {
    return readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }
}

/**
 * Find package.json files in the project (ignoring node_modules).
 */
export function findPackageJson(dir: string): string[] {
  return findFiles(dir, { filenames: ['package.json'] })
}
