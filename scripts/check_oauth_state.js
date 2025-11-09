#!/usr/bin/env node
/*
Usage:
  node scripts/check_oauth_state.js --state <STATE>
  node scripts/check_oauth_state.js --latest 5

Requires DATABASE_URL in environment (same as your app). 
This script will query the oauth_states table and print code_verifier and used_at.
*/

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function parseArgs(argv) {
  const out = { state: null, latest: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--state' && argv[i + 1]) { out.state = argv[++i]; continue; }
    if (a === '--latest' && argv[i + 1]) { out.latest = parseInt(argv[++i], 10) || 5; continue; }
  }
  return out;
}

async function main() {
  const { state, latest } = parseArgs(process.argv);
  if (!process.env.DATABASE_URL) {
    console.error('Missing DATABASE_URL in environment');
    process.exit(1);
  }

  if (state) {
    const rows = await prisma.$queryRawUnsafe(
      'SELECT state, nonce, code_verifier, tenant_id, used_at, created_at, updated_at FROM oauth_states WHERE state = $1 LIMIT 1',
      state
    );
    if (!rows || !rows[0]) {
      console.log('No row found for state:', state);
    } else {
      const r = rows[0];
      console.log('State row found:');
      console.log(JSON.stringify(r, null, 2));
      if (!r.code_verifier) {
        console.log('\nNOTE: code_verifier is NULL for this state. The PKCE was not persisted.');
      }
      if (r.used_at) {
        console.log('\nNOTE: used_at is set. If your callback filters by used_at IS NULL, it will not see this row.');
      }
    }
  } else {
    const n = Number.isInteger(latest) && latest > 0 ? latest : 5;
    const rows = await prisma.$queryRawUnsafe(
      `SELECT state, LEFT(code_verifier, 12) AS code_verifier_prefix, (code_verifier IS NOT NULL) AS has_code_verifier, used_at, created_at
       FROM oauth_states
       ORDER BY created_at DESC NULLS LAST, state DESC
       LIMIT ${n}`
    );
    console.log(`Last ${n} oauth_states:`);
    for (const r of rows) {
      console.log(JSON.stringify(r, null, 2));
    }
  }
}

main().catch((e) => {
  console.error('Unexpected error:', e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
