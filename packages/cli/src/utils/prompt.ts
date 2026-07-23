// ──────────────────────────────────────────────────────
// @tenantscale/cli — Interactive prompt utilities
// ──────────────────────────────────────────────────────

import { createInterface } from 'node:readline'
import pc from 'picocolors'

/**
 * Ask the user a question and get a response.
 */
export function ask(question: string, defaultValue?: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    const hint = defaultValue ? ` [${defaultValue}]` : ''
    rl.question(`${pc.cyan('?')} ${question}${pc.dim(hint)} `, (answer) => {
      rl.close()
      resolve(answer.trim() || defaultValue || '')
    })
  })
}

/**
 * Ask a yes/no question.
 */
export async function confirm(question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? 'Y/n' : 'y/N'
  const answer = await ask(`${question} ${pc.dim(`(${hint})`)}`, defaultYes ? 'y' : 'n')
  const normalized = answer.toLowerCase().trim()
  if (normalized === 'y' || normalized === 'yes') return true
  if (normalized === 'n' || normalized === 'no') return false
  return defaultYes
}

/**
 * Ask the user to pick from a list of options via keyboard.
 * Simplified version — prints options and asks for a number.
 */
export async function select(
  question: string,
  options: { name: string; value: string }[],
  defaultValue?: string,
): Promise<string> {
  console.log(`\n  ${pc.cyan('?')} ${question}`)
  for (let i = 0; i < options.length; i++) {
    const marker = options[i].value === defaultValue ? pc.green(' ●') : ' ○'
    console.log(`    ${pc.dim(`${i + 1}.`)}${marker} ${options[i].name}`)
  }

  const answer = await ask(
    `Enter number${defaultValue ? ` [${options.findIndex((o) => o.value === defaultValue) + 1 || 1}]` : ''}`,
  )
  const idx = parseInt(answer, 10) - 1
  if (idx >= 0 && idx < options.length) return options[idx].value
  if (defaultValue) return defaultValue
  return options[0].value
}

/**
 * Ask the user to select multiple items from a list.
 */
export async function multiSelect(
  question: string,
  options: { name: string; value: string; checked?: boolean }[],
): Promise<string[]> {
  console.log(`\n  ${pc.cyan('?')} ${question}`)
  console.log(`  ${pc.dim('(enter comma-separated numbers, or "all")')}`)

  for (let i = 0; i < options.length; i++) {
    const checked = options[i].checked ? pc.green(' ☑') : pc.dim(' ☐')
    console.log(`    ${pc.dim(`${i + 1}.`)}${checked} ${options[i].name}`)
  }

  const answer = await ask('Select items')
  if (answer.toLowerCase() === 'all') return options.map((o) => o.value)

  const indices = answer
    .split(',')
    .map((s) => parseInt(s.trim(), 10) - 1)
    .filter((n) => n >= 0 && n < options.length)
  if (indices.length === 0) {
    return options.filter((o) => o.checked).map((o) => o.value)
  }
  return indices.map((i) => options[i].value)
}
