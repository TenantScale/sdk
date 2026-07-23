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
