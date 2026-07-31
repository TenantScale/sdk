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
// create-tenantscale-app — Post-scaffold hooks
// ──────────────────────────────────────────────────────

import { execa } from 'execa'
import * as p from '@clack/prompts'
import type { PromptResults } from '../types.js'

/**
 * Run post-scaffold operations: install deps, git init, print next steps.
 */
export async function runPostScaffold(results: PromptResults): Promise<void> {
  const { projectName, targetDir, packageManager, gitInit, runInstall } =
    results as PromptResults & { targetDir: string }

  // ── Install dependencies ──
  if (runInstall) {
    const s = p.spinner()
    s.start(`Installing dependencies with ${packageManager}...`)

    try {
      const installCmd =
        packageManager === 'yarn'
          ? { file: 'yarn', args: ['install'] }
          : packageManager === 'npm'
            ? { file: 'npm', args: ['install'] }
            : { file: 'pnpm', args: ['install'] }
      await execa(installCmd.file, installCmd.args, {
        cwd: targetDir,
        stdio: 'pipe',
        timeout: 120_000,
      })
      s.stop(`Dependencies installed`)
    } catch (err) {
      s.stop(`Installation failed`)
      p.log.warn(
        `Could not install dependencies. Run "${packageManager} install" manually in ${projectName}.`,
      )
    }
  }

  // ── Git init ──
  if (gitInit) {
    const s = p.spinner()
    s.start('Initializing git repository...')

    try {
      await execa('git', ['init'], { cwd: targetDir, stdio: 'pipe' })
      await execa('git', ['add', '.'], { cwd: targetDir, stdio: 'pipe' })
      await execa('git', ['commit', '-m', 'initial commit', '--allow-empty'], {
        cwd: targetDir,
        stdio: 'pipe',
        // Allow empty commits if nothing changed
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'TenantScale',
          GIT_AUTHOR_EMAIL: 'dev@tenantscale.com',
          GIT_COMMITTER_NAME: 'TenantScale',
          GIT_COMMITTER_EMAIL: 'dev@tenantscale.com',
        },
      })
      s.stop('Git repository initialized')
    } catch (err) {
      s.stop('Git init skipped')
      p.log.warn('Could not initialize git (make sure git is installed).')
    }
  }

  // ── Next steps ──
  printNextSteps(results)
}

function printNextSteps(results: PromptResults): void {
  const { projectName, templateTier, stripe, runInstall } = results as PromptResults & {
    targetDir: string
  }

  p.note(
    `
  ${runInstall ? '' : `  ${results.packageManager} install\n`}  ${results.packageManager === 'pnpm' ? 'pnpm' : results.packageManager === 'yarn' ? 'yarn' : 'npm run'} dev

  Open http://localhost:3000 in your browser.
  ${
    templateTier !== 'minimal'
      ? `
  Create your account via the sign-up page (Supabase Auth) — there is no pre-seeded login.`
      : ''
  }
  ${
    stripe
      ? `
  💳 Stripe test mode is enabled.
     Use card 4242 4242 4242 4242 for test payments.`
      : ''
  }
  `.trim(),
    `🚀  ${projectName} is ready!`,
  )
}
