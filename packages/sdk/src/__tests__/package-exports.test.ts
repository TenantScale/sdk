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

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

type PackageJson = {
  exports?: {
    '.': {
      require?: string
    }
  }
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')

const packageJsonPaths = [
  'packages/sdk/package.json',
  'packages/express/package.json',
  'packages/hono/package.json',
  'packages/next/package.json',
  'packages/react/package.json',
]

describe('package export maps', () => {
  it('defines require condition for each published adapter/sdk package', () => {
    for (const packageJsonPath of packageJsonPaths) {
      const packageJson = JSON.parse(
        readFileSync(resolve(repoRoot, packageJsonPath), 'utf-8'),
      ) as PackageJson

      expect(packageJson.exports?.['.']?.require).toBe('./dist/index.cjs')
    }
  })
})
