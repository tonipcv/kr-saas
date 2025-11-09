#!/usr/bin/env node
/*
  Checks Open Finance setup:
  - Tables: oauth_states, oauth_state_meta, open_finance_links (and key columns)
  - Prisma mappings (by verifying snake_case columns exist)
  - Env flags relevant for dev validation
*/
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function tableExists(table) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS n
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    table
  );
  return (rows?.[0]?.n || 0) > 0;
}

async function listColumns(table) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
    table
  );
  return rows.map(r => r.column_name);
}

function hasAll(actual, expected) {
  const missing = expected.filter(c => !actual.includes(c));
  return { ok: missing.length === 0, missing };
}

async function main() {
  const issues = [];
  console.log('🔎 Checking Open Finance DB setup...');

  // oauth_states
  const t1 = 'oauth_states';
  const hasT1 = await tableExists(t1);
  console.log(`- ${t1}: ${hasT1 ? 'OK' : 'MISSING'}`);
  if (!hasT1) issues.push(`${t1} not found`);

  // oauth_state_meta
  const t2 = 'oauth_state_meta';
  const hasT2 = await tableExists(t2);
  console.log(`- ${t2}: ${hasT2 ? 'OK' : 'MISSING'}`);
  if (!hasT2) issues.push(`${t2} not found`);
  if (hasT2) {
    const cols = await listColumns(t2);
    const check = hasAll(cols, ['state', 'organisation_id', 'authorisation_server_id', 'created_at']);
    console.log(`  columns: ${cols.join(', ')}`);
    if (!check.ok) issues.push(`${t2} missing columns: ${check.missing.join(', ')}`);
  }

  // open_finance_links
  const t3 = 'open_finance_links';
  const hasT3 = await tableExists(t3);
  console.log(`- ${t3}: ${hasT3 ? 'OK' : 'MISSING'}`);
  if (!hasT3) issues.push(`${t3} not found`);
  if (hasT3) {
    const cols = await listColumns(t3);
    const expected = [
      'id','user_id','clinic_id','organisation_id','authorisation_server_id','enrollment_id','status','device_binding','created_at','updated_at'
    ];
    const check = hasAll(cols, expected);
    console.log(`  columns: ${cols.join(', ')}`);
    if (!check.ok) issues.push(`${t3} missing columns: ${check.missing.join(', ')}`);
  }

  // Env hints for dev
  const skip = process.env.SKIP_JWKS === 'true' || process.env.NODE_ENV !== 'production';
  console.log(`- Dev validation: SKIP_JWKS=${process.env.SKIP_JWKS || 'unset'} (effective=${skip})`);
  if (!skip) {
    console.log('  note: In dev, set SKIP_JWKS=true to bypass JWKS and external provider calls.');
  }

  if (issues.length) {
    console.error('\n❌ Setup issues found:');
    issues.forEach(i => console.error(' -', i));
    process.exitCode = 1;
  } else {
    console.log('\n✅ Open Finance setup looks good.');
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
