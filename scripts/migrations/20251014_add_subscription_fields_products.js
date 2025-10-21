#!/usr/bin/env node
/*
 * Migration: Add subscription-ready fields to products table
 * - Creates Postgres enums: "ProductType", "SubscriptionInterval"
 * - Adds columns on products:
 *   - type ProductType NOT NULL DEFAULT 'PRODUCT'
 *   - interval SubscriptionInterval NULL
 *   - intervalCount integer NULL DEFAULT 1
 *   - trialDays integer NULL
 *   - providerPlanId text NULL
 *   - providerPlanData jsonb NULL
 *   - autoRenew boolean NULL DEFAULT true
 * - Creates index on products(type)
 *
 * Safe to re-run (checks existence before changes).
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

function readSchemaPrisma() {
  const schemaPath = path.resolve(process.cwd(), 'prisma', 'schema.prisma');
  const content = fs.readFileSync(schemaPath, 'utf8');
  return { content, schemaPath };
}

function extractDatasourceUrl(schemaContent) {
  // Finds: datasource db { provider = "postgresql" url = "..." }
  const m = schemaContent.match(/datasource\s+db\s*\{[\s\S]*?url\s*=\s*"([^"]+)"/);
  return m ? m[1] : null;
}

async function run() {
  const envUrl = process.env.DATABASE_URL || null;
  const { content: schemaContent, schemaPath } = readSchemaPrisma();
  const schemaUrl = extractDatasourceUrl(schemaContent);
  const dbUrl = envUrl || schemaUrl;
  if (!dbUrl) throw new Error('DATABASE_URL not set and no url found in prisma/schema.prisma');

  console.log('[migrate] schema.prisma:', schemaPath);
  console.log('[migrate] DATABASE_URL (env):', redact(envUrl));
  console.log('[migrate] schema url       :', redact(schemaUrl));
  console.log('[migrate] using DB url     :', redact(dbUrl));

  const client = new PgClient({ connectionString: dbUrl });
  await client.connect();

  // Helpers
  const existsEnumSQL = (name) => `select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace where t.typname = '${name}' limit 1`;
  const existsColumnSQL = (table, column) => `select 1 from information_schema.columns where table_name='${table}' and column_name='${column}' limit 1`;
  const existsIndexSQL = (schema, indexName) => `select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='i' and c.relname='${indexName}' and n.nspname='${schema}' limit 1`;

  try {
    console.log('[migrate] starting transaction');
    await client.query('BEGIN');

    // 1) Create enums if not exists
    const enums = [
      {
        name: 'ProductType',
        create: `CREATE TYPE "ProductType" AS ENUM ('PRODUCT','SUBSCRIPTION')`,
      },
      {
        name: 'SubscriptionInterval',
        create: `CREATE TYPE "SubscriptionInterval" AS ENUM ('DAY','WEEK','MONTH','YEAR')`,
      },
    ];

    for (const e of enums) {
      const r = await client.query(existsEnumSQL(e.name));
      if (r.rowCount === 0) {
        console.log(`[migrate] creating enum ${e.name}`);
        await client.query(e.create);
      } else {
        console.log(`[migrate] enum ${e.name} already exists`);
      }
    }

    // 2) Add columns to products
    const table = 'products';
    const addColumn = async (col, ddl) => {
      const r = await client.query(existsColumnSQL(table, col));
      if (r.rowCount === 0) {
        console.log(`[migrate] adding column ${table}.${col}`);
        await client.query(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`);
      } else {
        console.log(`[migrate] column ${table}.${col} already exists`);
      }
    };

    await addColumn('type', '"ProductType" NOT NULL DEFAULT \u0027PRODUCT\u0027');
    await addColumn('interval', '"SubscriptionInterval" NULL');
    await addColumn('intervalCount', 'integer NULL DEFAULT 1');
    await addColumn('trialDays', 'integer NULL');
    await addColumn('providerPlanId', 'text NULL');
    await addColumn('providerPlanData', 'jsonb NULL');
    await addColumn('autoRenew', 'boolean NULL DEFAULT true');

    // 3) Create index on products(type)
    // Assume public schema
    const idxName = 'products_type_idx';
    const idxExists = await client.query(existsIndexSQL('public', idxName));
    if (idxExists.rowCount === 0) {
      console.log('[migrate] creating index', idxName);
      await client.query(`CREATE INDEX ${idxName} ON ${table}(type)`);
    } else {
      console.log('[migrate] index already exists', idxName);
    }

    await client.query('COMMIT');
    console.log('[migrate] done');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[migrate] error:', e && e.message ? e.message : e);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

run().catch((e) => {
  console.error('[migrate] unhandled error', e);
  process.exitCode = 1;
});
