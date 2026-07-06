// ──────────────────────────────────────────────────────
// @tenantscale/cli — Framework Detector
// ──────────────────────────────────────────────────────
// Analyses package.json dependencies and source imports
// to determine what web framework(s) the project uses.

import { readFileSync } from 'node:fs'
import { findFiles } from '../utils/file-glob.js'

export interface FrameworkInfo {
  /** Primary framework detected */
  framework: 'express' | 'hono' | 'nextjs' | 'fastify' | 'none'
  /** Confidence level (0-1) */
  confidence: number
  /** How the framework was detected */
  evidence: string[]
  /** Detected entry point files */
  entryPoints: string[]
  /** Whether the project is a monorepo */
  isMonorepo: boolean
}

const FRAMEWORK_DEPS: Record<string, RegExp[]> = {
  express: [/express/],
  hono: [/^hono(\/|$)/],
  nextjs: [/^next(\/|$)/],
  fastify: [/^fastify(\/|$)/],
}

const FRAMEWORK_IMPORT_PATTERNS: Record<string, RegExp[]> = {
  express: [
    /from\s+['"]express['"]/,
    /require\(['"]express['"]\)/,
  ],
  hono: [
    /from\s+['"]hono['"]/,
    /from\s+['"]hono\//,
    /new\s+Hono\s*\(/,
    /createMiddleware\s*\(/,
  ],
  nextjs: [
    /from\s+['"]next\//,
    /from\s+['"]next\/api['"]/,
    /export\s+(default\s+)?async\s+function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS)\s*\(/,
  ],
  fastify: [
    /from\s+['"]fastify['"]/,
    /require\(['"]fastify['"]\)/,
    /fastify\s*\(/,
  ],
}

/**
 * Detect the web framework used by the project.
 * Scans package.json dependencies and source files for imports.
 */
export function detectFramework(projectDir: string, sourceFiles: string[]): FrameworkInfo {
  const evidence: string[] = []
  const entryPoints: string[] = []
  let isMonorepo = false
  const scores: Record<string, number> = { express: 0, hono: 0, nextjs: 0, fastify: 0 }

  // ── Scan package.json(s) for dependency hints ──
  const pkgPaths = findPackageJsons(projectDir)
  if (pkgPaths.length > 1) {
    isMonorepo = true
  }

  for (const pkgPath of pkgPaths) {
    const content = readFileSafe(pkgPath)
    if (!content) continue

    try {
      const pkg = JSON.parse(content)
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }

      for (const [framework, patterns] of Object.entries(FRAMEWORK_DEPS)) {
        for (const dep of Object.keys(allDeps)) {
          if (patterns.some(p => p.test(dep))) {
            scores[framework] += 3
            evidence.push(`Found "${dep}" in ${relativeShort(projectDir, pkgPath)}`)
          }
        }
      }
    } catch {
      // skip invalid JSON
    }
  }

  // ── Scan source files for import patterns ──
  const fileLimit = Math.min(sourceFiles.length, 50) // scan up to 50 files
  for (let i = 0; i < fileLimit; i++) {
    const content = readFileSafe(sourceFiles[i])
    if (!content) continue

    for (const [framework, patterns] of Object.entries(FRAMEWORK_IMPORT_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(content)) {
          scores[framework] += 1
          if (!evidence.includes(`Found ${framework} import in ${relativeShort(projectDir, sourceFiles[i])}`)) {
            evidence.push(`Found ${framework} import in ${relativeShort(projectDir, sourceFiles[i])}`)
          }
          // Track potential entry points
          const base = sourceFiles[i].replace(/\\/g, '/')
          if (base.includes('app.') || base.includes('server.') || base.includes('index.') || base.includes('main.')) {
            if (!entryPoints.includes(sourceFiles[i])) {
              entryPoints.push(sourceFiles[i])
            }
          }
          break
        }
      }
    }
  }

  // ── Check for Next.js App Router ──
  const nextRoutes = sourceFiles.filter(f =>
    f.includes(`${sep(projectDir)}app${sep}`) && f.endsWith('.ts') || f.endsWith('.tsx')
  )
  if (nextRoutes.length > 0 && scores['nextjs'] > 0) {
    evidence.push(`Found ${nextRoutes.length} files in app/ directory (Next.js App Router)`)
  }

  // ── Determine winner ──
  const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a)
  const [topName, topScore] = sorted[0]
  const [, secondScore] = sorted[1] ?? ['', 0]

  // Normalize: if no framework detected, return 'none'
  if (topScore === 0) {
    return {
      framework: 'none',
      confidence: 1,
      evidence: ['No framework dependencies or imports detected'],
      entryPoints: [],
      isMonorepo,
    }
  }

  // If scores are very close, confidence drops
  const confidence = secondScore > 0 ? topScore / (topScore + secondScore) : 1

  return {
    framework: topName as FrameworkInfo['framework'],
    confidence: Math.round(confidence * 100) / 100,
    evidence,
    entryPoints: Array.from(new Set(entryPoints)),
    isMonorepo,
  }
}

// ── Helpers ──

function findPackageJsons(dir: string): string[] {
  return findFiles(dir, { filenames: ['package.json'] })
}

function readFileSafe(path: string): string | null {
  try {
    return readFileSync(path, 'utf-8')
  } catch {
    return null
  }
}

function relativeShort(base: string, target: string): string {
  const rel = target.replace(base, '').replace(/\\/g, '/').replace(/^\//, '')
  return rel || '.' + sep(base) + target.split(sep(base)).pop()
}

function sep(base: string): string {
  return base.includes('\\') ? '\\' : '/'
}
