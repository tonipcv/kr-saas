#!/usr/bin/env node
/**
 * which-database.js
 * Print the effective database Node/Prisma will use at runtime and basic connection info.
 *
 * It reports:
 * - process.env.DATABASE_URL (redacted)
 * - prisma/schema.prisma datasource url (redacted)
 * - The URL Prisma will actually use (lib/prisma.ts sets datasources.db.url = env)
 * - Live PostgreSQL connection metadata for the chosen URL
 *
 * Usage:
 *   node scripts/which-database.js
 *   DATABASE_URL=postgres://... node scripts/which-database.js
 */
const fs = require('fs');
const path = require('path');
const { Client: PgClient } = require('pg');

function redact(url) {
  if (!url) return '(unset)';
  try {
    const u = new URL(url);
    if (u.username) u.username = '***';
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return String(url).replace(/:\/\/([^:]+):([^@]+)@/, '://***:***@');
  }
}

function readSchemaUrl() {
  try {
    const schemaPath = path.resolve(process.cwd(), 'prisma', 'schema.prisma');
    if (!fs.existsSync(schemaPath)) return null;
    const content = fs.readFileSync(schemaPath, 'utf8');
    const m = content.match(/datasource\s+db\s*\{[\s\S]*?url\s*=\s*"([^"]+)"/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

async function probe(url) {
  const client = new PgClient({ connectionString: url });
  await client.connect();
  try {
    const meta = await client.query(
      `select current_user, current_database(), version() as server_version,
              (select setting from pg_settings where name='search_path') as search_path`
    );
    const m = meta.rows[0] || {};
    const tables = await client.query(
      `select count(*)::int as c from information_schema.tables where table_type='BASE TABLE' and table_schema not in ('pg_catalog','information_schema')`
    );
    return {
      current_user: m.current_user,
      current_database: m.current_database,
      server_version: String(m.server_version || '').split('\n')[0],
      search_path: m.search_path,
      base_table_count: tables.rows[0]?.c ?? 0,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

(async () => {
  const envUrl = process.env.DATABASE_URL || null;
  const schemaUrl = readSchemaUrl();
  const effective = envUrl || schemaUrl;

  console.log('Runtime env DATABASE_URL :', redact(envUrl));
  console.log('schema.prisma url        :', redact(schemaUrl));
  console.log('Effective Prisma URL     :', redact(effective));

  if (!effective) {
    console.log('\nNo database URL found. Set DATABASE_URL or define url in prisma/schema.prisma.');
    process.exit(1);
  }

  try {
    const info = await probe(effective);
    console.log('\nLive connection info:');
    console.table(info);
  } catch (e) {
    console.error('\nFailed to connect to database using Effective Prisma URL.');
    console.error(String(e && e.message || e));
    process.exitCode = 2;
  }
})();
