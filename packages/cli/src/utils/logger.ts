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
