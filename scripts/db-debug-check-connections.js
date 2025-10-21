#!/usr/bin/env node
/**
 * Debug DB connections: compare runtime DATABASE_URL vs schema.prisma URL.
 * Prints which DB the app (Prisma Client at runtime) is using, and counts of key tables in both.
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { Client: PgClient } = require('pg');

async function readSchemaUrl() {
  const schemaPath = path.resolve(__dirname, '..', 'prisma', 'schema.prisma');
  const altSchemaPath = path.resolve(process.cwd(), 'prisma', 'schema.prisma');
  let fullPath = schemaPath;
  if (!fs.existsSync(fullPath) && fs.existsSync(altSchemaPath)) fullPath = altSchemaPath;
  const content = fs.readFileSync(fullPath, 'utf8');
  // naive parse for: url = "..."
  const m = content.match(/datasource\s+db\s*{[\s\S]*?url\s*=\s*"([^"]+)"/);
  return m ? m[1] : null;
}

function readEnvFileUrl(filename) {
  try {
    const p = path.resolve(process.cwd(), filename);
    if (!fs.existsSync(p)) return null;
    const content = fs.readFileSync(p, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/^\s*DATABASE_URL\s*=\s*(.+)\s*$/);
      if (m) {
        // Strip optional quotes
        return m[1].replace(/^"|"$/g, '').replace(/^'|'$/g, '');
      }
    }
  } catch {}
  return null;
}

function redact(url) {
  if (!url) return '(unset)';
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    if (u.username) u.username = '***';
    return u.toString();
  } catch {
    return url.replace(/:\/\/([^:]+):([^@]+)@/, '://***:***@');
  }
}

async function countWithPrisma(url) {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const [users, clinics, products, verificationTokens] = await Promise.all([
      prisma.user.count().catch(() => null),
      prisma.clinic.count().catch(() => null),
      prisma.products.count().catch(() => null),
      prisma.verificationToken.count().catch(() => null),
    ]);
    return { users, clinics, products, verificationTokens };
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

async function sampleWithPrisma(url) {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const users = await prisma.user.findMany({ select: { id: true, email: true, role: true, created_at: true }, take: 5 }).catch(() => []);
    const vt = await prisma.verificationToken.findMany({ select: { identifier: true, token: true, expires: true }, take: 5 }).catch(() => []);
    return { users, verificationTokens: vt };
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

async function countWithPg(url) {
  const client = new PgClient({ connectionString: url });
  try {
    await client.connect();
    // Print connection metadata and table existence
    try {
      const meta = await client.query(
        `select current_user, current_database(), version() as server_version,
                (select setting from pg_settings where name='search_path') as search_path`
      );
      const m = meta.rows[0] || {};
      console.log(' connection:', {
        current_user: m.current_user,
        current_database: m.current_database,
        server_version: (m.server_version || '').split('\n')[0],
        search_path: m.search_path,
      });
      const tables = await client.query(
        `select table_schema, table_name from information_schema.tables
         where table_type='BASE TABLE' and table_schema not in ('pg_catalog','information_schema')
         and table_name in ('User','users','VerificationToken','verificationtoken','clinics','products')
         order by table_schema, table_name`
      );
      console.log(' tables found:', tables.rows);
    } catch {}

    const q = async (table) => {
      try { const r = await client.query(`select count(*)::int as c from ${table}`); return r.rows[0].c; } catch { return null; }
    };
    return {
      users_quoted: await q('"User"'),
      users_unquoted: await q('users'),
      clinics: await q('clinics'),
      products: await q('products'),
      verificationtokens_quoted: await q('"VerificationToken"'),
      verificationtokens_unquoted: await q('verificationtoken'),
    };
  } finally {
    await client.end().catch(() => {});
  }
}

(async () => {
  const runtimeUrl = process.env.DATABASE_URL || null;
  const schemaUrl = await readSchemaUrl();
  const envUrl = readEnvFileUrl('.env');
  const envLocalUrl = readEnvFileUrl('.env.local');

  console.log('Runtime DATABASE_URL:', redact(runtimeUrl));
  console.log('schema.prisma url    :', redact(schemaUrl));
  console.log('.env DATABASE_URL     :', redact(envUrl));
  console.log('.env.local DATABASE_URL:', redact(envLocalUrl));
  console.log('Note: runtime PrismaClient in lib/prisma.ts uses env DATABASE_URL. Prisma Studio may use schema.prisma url if not overridden.');

  // Collect distinct URLs to probe
  const urls = [runtimeUrl, schemaUrl, envUrl, envLocalUrl].filter(Boolean);
  const distinct = Array.from(new Set(urls));

  for (const url of distinct) {
    console.log(`\n== Counts using Prisma (${redact(url)}) ==`);
    const counts = await countWithPrisma(url);
    console.table(counts);
    console.log(`-- Sample rows (Prisma) --`);
    const samples = await sampleWithPrisma(url);
    console.dir(samples, { depth: null });
  }

  for (const url of distinct) {
    console.log(`\n== Counts using pg (${redact(url)}) ==`);
    const counts = await countWithPg(url);
    console.table(counts);
  }

  console.log('\nDiagnosis:');
  if (envLocalUrl && runtimeUrl && envLocalUrl !== runtimeUrl) {
    console.log('- Shell runtime DATABASE_URL and .env.local DATABASE_URL differ. Next dev likely uses .env/.env.local, while your CLI uses shell env.');
  }
  if (schemaUrl && runtimeUrl && schemaUrl !== runtimeUrl) {
    console.log('- schema.prisma URL differs from runtime. Prisma Studio may connect to schema URL; app connects to runtime env URL.');
  }
  console.log('- If all URLs match but data still differs, check for multiple schemas (search_path), role permissions, or a different Postgres instance behind a proxy.');
})();
