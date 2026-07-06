#!/usr/bin/env node

import { Command } from 'commander';
import { initAction } from './commands/init.js';
import { migrateAction } from './commands/migrate.js';

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

const DEFAULT_PROJECT_DIR = './my-multi-tenant-app';

const program = new Command();

program
  .name('tenantscale')
  .description('Scaffold multi-tenant SaaS projects with TenantScale')
  .version(pkg.version);

program
  .command('init')
  .description('Scaffold a new multi-tenant project')
  .argument('[directory]', 'Project directory', DEFAULT_PROJECT_DIR)
  .option('-f, --framework <framework>', 'Framework to use (hono, express)', 'none')
  .option('-t, --table <table>', 'Table name to add tenant_id to', 'projects')
  .option('--non-interactive', 'Skip prompts and use provided flags')
  .action(initAction);

program
  .command('migrate')
  .description('Analyze an existing codebase and generate tenant isolation migration artifacts')
  .argument('[directory]', 'Project directory to analyze')
  .option('--non-interactive', 'Skip prompts and use defaults')
  .option('--report-only', 'Only generate the report, skip SQL/middleware generation')
  .option('-o, --output <path>', 'Output directory for generated artifacts', './tenantscale/migrate')
  .option('--framework <name>', 'Override framework detection')
  .option('--db-type <type>', 'Override database type detection')
  .action(migrateAction);

program.parse(process.argv);
