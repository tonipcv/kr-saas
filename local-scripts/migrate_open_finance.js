#!/usr/bin/env node
/**
 * Safe Open Finance migration runner.
 *
 * Usage:
 *   node local-scripts/migrate_open_finance.js           # preview SQL only (no changes)
 *   node local-scripts/migrate_open_finance.js --apply   # apply migration (dev) and prisma generate
 *
 * Notes:
 * - This script is additive-only based on current prisma/schema.prisma.
 * - It shows the SQL diff first so you can review what's going to run.
 */

const { spawnSync } = require('node:child_process');
const process = require('node:process');

// Load env from .env.local then .env (if available)
try {
  require('dotenv').config({ path: '.env.local' });
} catch {}
try {
  require('dotenv').config({ path: '.env' });
} catch {}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (res.error) {
    console.error(`[error] failed to run: ${cmd} ${args.join(' ')}`);
    console.error(res.error);
    process.exit(1);
  }
  if (typeof res.status === 'number' && res.status !== 0) {
    console.error(`[error] command exited with code ${res.status}: ${cmd} ${args.join(' ')}`);
    process.exit(res.status);
  }
}

function ensureEnv() {
  if (!process.env.DATABASE_URL) {
    console.error('[fatal] DATABASE_URL is not set. Aborting.');
    process.exit(1);
  }
}

(function main() {
  const apply = process.argv.includes('--apply');

  ensureEnv();

  console.log('Step 1/3: Preview SQL diff (no changes yet)');
  run('npx', [
    'prisma', 'migrate', 'diff',
    '--from-url', process.env.DATABASE_URL,
    '--to-schema-datamodel', 'prisma/schema.prisma',
    '--script'
  ]);

  if (!apply) {
    console.log('\nPreview complete. To apply the migration, run with --apply');
    return;
  }

  console.log('\nStep 2/3: Apply migration (dev)');
  run('npx', ['prisma', 'migrate', 'dev', '-n', 'open-finance_data_contract']);

  console.log('\nStep 3/3: Generate Prisma client');
  run('npx', ['prisma', 'generate']);

  console.log('\nMigration applied successfully.');
})();
