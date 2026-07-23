// ──────────────────────────────────────────────────────
// @tenantscale/cli — Auth Pattern Detector
// ──────────────────────────────────────────────────────

import { readFileSafe } from '../utils/file-glob.js'
import type { FrameworkInfo } from './framework.js'

export interface AuthInfo {
  /** Detected auth approach */
  approach: 'jwt' | 'session' | 'api-key' | 'oauth' | 'none'
  /** Auth library used */
  library: string | null
  /** Files containing auth middleware */
  middlewareFiles: string[]
  /** Sources that read auth headers / tokens */
  authPatternsFound: string[]
  /** Whether Tenantscale adapters can slot in */
  compatibleWithTenantScale: boolean
  /** Evidence */
  evidence: string[]
}

// Auth library detection
const AUTH_LIBRARIES: Record<string, RegExp[]> = {
  jsonwebtoken: [/jsonwebtoken/],
  'next-auth': [/next-auth/, /@auth\/\w+/],
  'express-jwt': [/express-jwt/],
  passport: [/passport/],
  supabase: [/@supabase\/supabase-js/, /supabase/],
  clerk: [/@clerk\//],
  workos: [/@workos-inc\/node/],
}

// Auth pattern detection in source code
const AUTH_READ_PATTERNS = [
  /req\.headers?\['authorization'\]/i,
  /req\.headers?\['x-api-key'\]/i,
  /req\.headers?\.authorization/i,
  /c\.req\.header\s*\(\s*['"]authorization['"]/i,
  /c\.req\.header\s*\(\s*['"]x-api-key['"]/i,
  /\bbearer\b/i,
  /\bjwt\b/i,
  /\btoken\b/,
  /\bapi[_-]?key\b/i,
  /auth\.getUser\s*\(/,
  /auth\.getSession\s*\(/,
  /getToken\s*\(/,
  /verifyIdToken\s*\(/,
  /res\.[sc]ookie\s*\(/,
]

/**
 * Detect authentication patterns in the project.
 */
export function analyzeAuth(sourceFiles: string[], _framework: FrameworkInfo): AuthInfo {
  const evidence: string[] = []
  const middlewareFiles: string[] = []
  const authPatternsFound: string[] = []
  let detectedLibrary: string | null = null
  let jwtCount = 0
  let apiKeyCount = 0
  let sessionCount = 0

  // First check package.json for auth libraries
  const pkgFiles = sourceFiles.filter((f) => f.endsWith('package.json'))
  for (const f of pkgFiles) {
    const content = readFileSafe(f)
    if (!content) continue
    try {
      const pkg = JSON.parse(content)
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      for (const [libName, patterns] of Object.entries(AUTH_LIBRARIES)) {
        for (const dep of Object.keys(deps)) {
          if (patterns.some((p) => p.test(dep))) {
            detectedLibrary = libName
            evidence.push(`Found auth library: ${libName} (${dep})`)
            break
          }
        }
        if (detectedLibrary) break
      }
    } catch {
      /* skip */
    }
  }

  // Scan source files for auth patterns
  for (const file of sourceFiles) {
    if (file.endsWith('package.json')) continue
    const content = readFileSafe(file)
    if (!content) continue

    // Check for auth middleware files specifically
    const isMiddleware =
      file.toLowerCase().includes('auth') ||
      file.toLowerCase().includes('middleware') ||
      file.toLowerCase().includes('protect')

    for (const pattern of AUTH_READ_PATTERNS) {
      if (pattern.test(content)) {
        const patternStr = pattern.source.substring(0, 40)
        if (!authPatternsFound.includes(patternStr)) {
          authPatternsFound.push(patternStr)
        }

        // Count pattern types
        if (/api[_-]?key/i.test(patternStr)) apiKeyCount++
        else if (/bearer|jwt|token/i.test(patternStr)) jwtCount++
        else if (/cookie|session/i.test(patternStr)) sessionCount++

        if (isMiddleware && !middlewareFiles.includes(file)) {
          middlewareFiles.push(file)
          evidence.push(`Found auth middleware: ${file.replace(/^.*src[\\/]/, 'src/')}`)
        }
      }
    }
  }

  // Determine approach
  let approach: AuthInfo['approach'] = 'none'
  if (jwtCount > apiKeyCount && jwtCount > sessionCount) approach = 'jwt'
  else if (apiKeyCount >= jwtCount && apiKeyCount >= sessionCount) approach = 'api-key'
  else if (sessionCount >= jwtCount && sessionCount >= apiKeyCount) approach = 'session'
  else if (authPatternsFound.length > 0) approach = 'jwt'

  if (approach === 'none') {
    evidence.push('No authentication patterns detected')
  } else {
    evidence.push(`Primary auth approach: ${approach}`)
  }

  // TenantScale compatibility
  const compatibleWithTenantScale =
    approach === 'api-key' || approach === 'jwt' || detectedLibrary === 'supabase'

  return {
    approach,
    library: detectedLibrary,
    middlewareFiles: Array.from(new Set(middlewareFiles)),
    authPatternsFound: Array.from(new Set(authPatternsFound)),
    compatibleWithTenantScale,
    evidence,
  }
}
