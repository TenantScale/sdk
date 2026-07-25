#!/usr/bin/env node

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

import { Command } from 'commander'
import { initAction } from './commands/init.js'
import { migrateAction } from './commands/migrate.js'

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'))

const DEFAULT_PROJECT_DIR = './my-multi-tenant-app'

const program = new Command()

program
  .name('tenantscale')
  .description('Scaffold multi-tenant SaaS projects with TenantScale')
  .version(pkg.version)

program
  .command('init')
  .description('Scaffold a new multi-tenant project')
  .argument('[directory]', 'Project directory', DEFAULT_PROJECT_DIR)
  .option('-f, --framework <framework>', 'Framework to use (hono, express)', 'none')
  .option('-t, --table <table>', 'Table name to add tenant_id to', 'projects')
  .option('--non-interactive', 'Skip prompts and use provided flags')
  .action(initAction)

program
  .command('migrate')
  .description('Analyze an existing codebase and generate tenant isolation migration artifacts')
  .argument('[directory]', 'Project directory to analyze')
  .option('--non-interactive', 'Skip prompts and use defaults')
  .option('--report-only', 'Only generate the report, skip SQL/middleware generation')
  .option(
    '-o, --output <path>',
    'Output directory for generated artifacts',
    './tenantscale/migrate',
  )
  .option('--framework <name>', 'Override framework detection')
  .option('--db-type <type>', 'Override database type detection')
  .action(migrateAction)

program.parse(process.argv)
