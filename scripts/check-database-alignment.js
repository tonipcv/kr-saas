#!/usr/bin/env node
/**
 * Check which database the app will use and verify products table columns.
 *
 * Usage:
 *   node scripts/check-database-alignment.js
 *   node scripts/check-database-alignment.js --url "postgres://..."
 *
 * Resolution order for DB URL:
 *   1) --url argument
 *   2) process.env.DATABASE_URL
 *   3) url from prisma/schema.prisma datasource
 */

const fs = require('fs');
const path = require('path');
const { Client: PgClient } = require('pg');

function redact(url) {
  if (!url) return '(unset)';
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    if (u.username) u.username = '***';
    return u.toString();
  } catch {
    return String(url).replace(/:\/\/([^:]+):([^@]+)@/, '://***:***@');
  }
}

function getArgUrl() {
  const idx = process.argv.indexOf('--url');
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return null;
}

function readSchemaPrismaUrl() {
  try {
    const schemaPath = path.resolve(process.cwd(), 'prisma', 'schema.prisma');
    const content = fs.readFileSync(schemaPath, 'utf8');
    const m = content.match(/datasource\s+db\s*\{[\s\S]*?url\s*=\s*(?:env\("([^"]+)"\)|"([^"]+)")/);
    if (!m) return null;
    // If url = env("NAME"), we only return the env var name for info
    if (m[1]) return `env:${m[1]}`;
    if (m[2]) return m[2];
    return null;
  } catch {
    return null;
  }
}

async function check() {
  const argUrl = getArgUrl();
  const envUrl = process.env.DATABASE_URL || null;
  const schemaUrl = readSchemaPrismaUrl();
  // Effective URL preference
  const effectiveUrl = argUrl || envUrl || (schemaUrl && !schemaUrl.startsWith('env:') ? schemaUrl : null);

  console.log('Arg URL        :', redact(argUrl));
  console.log('Env DATABASE_URL:', redact(envUrl));
  console.log('Schema URL     :', schemaUrl || '(unset)');
  console.log('Using URL      :', redact(effectiveUrl));

  if (!effectiveUrl) {
    console.error('\nNo database URL could be resolved. Provide --url or set DATABASE_URL.');
    process.exit(1);
  }

  const client = new PgClient({ connectionString: effectiveUrl });
  await client.connect();
  try {
    const dbInfo = await client.query('select current_database() as db, version()');
    const { db, version } = { db: dbInfo.rows[0]?.db, version: dbInfo.rows[0]?.version };
    console.log('\nConnected to   :', db);
    console.log('Postgres       :', version?.split('\n')[0]);

    // Table presence
    const tbl = await client.query(`select 1 from information_schema.tables where table_name='products' limit 1`);
    console.log('\nproducts table :', tbl.rowCount > 0 ? 'FOUND' : 'NOT FOUND');
    if (tbl.rowCount === 0) {
      return; // nothing else to check
    }

    // Columns
    const colsRes = await client.query(`
      select column_name
      from information_schema.columns
      where table_name='products'
      order by column_name
    `);
    const cols = colsRes.rows.map(r => r.column_name);
    console.log('\nproducts columns (' + cols.length + '):');
    console.log(cols.join(', '));

    // Expected new columns
    const expected = [
      'type',
      'interval',
      'intervalcount', // note: Postgres lowercases unquoted identifiers
      'trialdays',
      'providerplanid',
      'providerplandata',
      'autorenew',
    ];

    console.log('\nExpected subscription fields presence:');
    for (const e of expected) {
      const found = cols.includes(e) || cols.includes(e.toLowerCase()) || cols.includes(e.toUpperCase());
      console.log(`- ${e} => ${found ? 'OK' : 'MISSING'}`);
    }

    // If Prisma expects camelCase, warn about casing mismatch
    const camelExpected = ['intervalCount', 'trialDays', 'providerPlanId', 'providerPlanData', 'autoRenew'];
    const hasCamel = camelExpected.some(c => cols.includes(c));
    if (hasCamel) {
      console.warn('\nWarning: Found camelCase columns on products (quoted identifiers).');
    }

  } finally {
    await client.end().catch(() => {});
  }
}

check().catch((e) => {
  console.error('check failed:', e?.message || e);
  process.exit(1);
});
