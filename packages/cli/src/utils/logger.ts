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
// @tenantscale/cli — Logger & pretty output utilities
// ──────────────────────────────────────────────────────

import pc from 'picocolors'

export type LogLevel = 'info' | 'warn' | 'error' | 'success' | 'debug'

export interface Logger {
  info: (msg: string) => void
  warn: (msg: string) => void
  error: (msg: string) => void
  success: (msg: string) => void
  debug: (msg: string) => void
  section: (title: string) => void
  table: (rows: { label: string; value: string; status?: 'ok' | 'warn' | 'error' }[]) => void
  raw: (msg: string) => void
}

export function createLogger(): Logger {
  return {
    info(msg: string) {
      console.log(`  ${pc.dim('ℹ')} ${msg}`)
    },
    warn(msg: string) {
      console.log(`  ${pc.yellow('⚠')} ${pc.yellow(msg)}`)
    },
    error(msg: string) {
      console.log(`  ${pc.red('✗')} ${pc.red(msg)}`)
    },
    success(msg: string) {
      console.log(`  ${pc.green('✓')} ${pc.green(msg)}`)
    },
    debug(msg: string) {
      if (process.env.DEBUG) {
        console.log(`  ${pc.dim('→')} ${pc.dim(msg)}`)
      }
    },
    section(title: string) {
      console.log('')
      console.log(pc.bold(pc.cyan(title)))
      console.log(pc.dim('─'.repeat(Math.min(title.length + 2, 60))))
    },
    table(rows) {
      const maxLabelWidth = Math.max(...rows.map((r) => r.label.length))
      for (const row of rows) {
        const icon =
          row.status === 'ok'
            ? pc.green('✓')
            : row.status === 'warn'
              ? pc.yellow('⚠')
              : row.status === 'error'
                ? pc.red('✗')
                : ' '
        const padded = row.label.padEnd(maxLabelWidth)
        console.log(`  ${icon} ${pc.bold(padded)}  ${row.value}`)
      }
    },
    raw(msg: string) {
      console.log(msg)
    },
  }
}
