#!/usr/bin/env node
/*
  Safe Prisma migration runner
  - Formats and validates schema
  - Optionally shows diff (preview)
  - Applies migration in dev (migrate dev) or prod (migrate deploy) with guards

  Usage examples:
    node scripts/migrations/run_safe_prisma_migrate.js --preview
    node scripts/migrations/run_safe_prisma_migrate.js --apply --name "add_payment_orchestration_models"
    node scripts/migrations/run_safe_prisma_migrate.js --apply --deploy   # production deploy
    node scripts/migrations/run_safe_prisma_migrate.js --apply --name foo --force  # bypass env guard
*/

const { spawnSync } = require('child_process');
const path = require('path');

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', env: process.env, cwd: process.cwd(), ...opts });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    const msg = `Command failed: ${cmd} ${args.join(' ')}`;
    throw new Error(msg);
  }
}

function getArg(flag) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  return process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true;
}

const apply = Boolean(getArg('--apply'));
const preview = Boolean(getArg('--preview')) || !apply;
const nameArg = getArg('--name');
const deploy = Boolean(getArg('--deploy'));
const force = Boolean(getArg('--force'));

const NODE_ENV = process.env.NODE_ENV || 'development';
const databaseUrl = process.env.DATABASE_URL || '';

function guardEnv() {
  if (deploy) {
    // Deploy is safe in prod; prisma handles pending migrations only
    return;
  }
  if (apply && NODE_ENV === 'production' && !force) {
    console.error('[guard] NODE_ENV=production detected. Refusing to run prisma migrate dev without --force.');
    process.exit(2);
  }
  if (apply && /@localhost|localhost|127\.0\.0\.1|\.local/.test(databaseUrl) === false && !force) {
    console.error('[guard] DATABASE_URL does not look local. Use --force to proceed or run --deploy instead.');
    process.exit(2);
  }
}

(async function main() {
  try {
    console.log('[step] prisma format');
    run('npx', ['prisma', 'format']);

    console.log('[step] prisma validate');
    run('npx', ['prisma', 'validate']);

    if (preview) {
      console.log('[step] prisma migrate diff (preview)');
      // Show diff from database to schema (shadow database usage may vary). This is non-destructive.
      run('npx', ['prisma', 'migrate', 'diff', '--from-url', databaseUrl, '--to-schema-datamodel', path.join('prisma', 'schema.prisma')]);
    }

    if (apply) {
      guardEnv();
      if (deploy) {
        console.log('[apply] prisma migrate deploy');
        run('npx', ['prisma', 'migrate', 'deploy']);
      } else {
        const name = typeof nameArg === 'string' ? nameArg : `auto_${new Date().toISOString().replace(/[:.]/g, '-')}`;
        console.log('[apply] prisma migrate dev -n', name);
        run('npx', ['prisma', 'migrate', 'dev', '-n', name]);
      }
    } else {
      console.log('[done] Preview only. No migration applied. Use --apply to apply migrations.');
    }
  } catch (err) {
    console.error('[error]', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
