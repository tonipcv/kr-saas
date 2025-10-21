#!/usr/bin/env node
/*
 * Migration: Create offers and offer_payment_methods tables
 * - Creates Postgres enums: "Currency", "PaymentMethod" (idempotent)
 * - Creates table offers
 * - Creates table offer_payment_methods
 * - Adds indexes and FKs
 *
 * This is NON-BREAKING. It does not drop or alter legacy columns on products.
 */

require('dotenv').config();
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
  // Finds: datasource db { provider = "postgresql" url = env("DATABASE_URL") or a literal }
  const envMatch = schemaContent.match(/url\s*=\s*env\("([A-Z0-9_]+)"\)/);
  if (envMatch) return process.env[envMatch[1]] || null;
  const litMatch = schemaContent.match(/url\s*=\s*"([^"]+)"/);
  return litMatch ? litMatch[1] : null;
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
  const existsTableSQL = (table) => `select 1 from information_schema.tables where table_schema='public' and table_name='${table}' limit 1`;
  const existsIndexSQL = (schema, indexName) => `select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='i' and c.relname='${indexName}' and n.nspname='${schema}' limit 1`;

  try {
    console.log('[migrate] starting transaction');
    await client.query('BEGIN');

    // 1) Create enums if not exists
    const enums = [
      { name: 'Currency', create: `CREATE TYPE "Currency" AS ENUM ('BRL','USD','EUR')` },
      { name: 'PaymentMethod', create: `CREATE TYPE "PaymentMethod" AS ENUM ('CARD','PIX','BOLETO','PAYPAL')` },
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

    // 2) Create offers table
    const offersTable = 'offers';
    const offersExists = await client.query(existsTableSQL(offersTable));
    if (offersExists.rowCount === 0) {
      console.log('[migrate] creating table offers');
      await client.query(`
        CREATE TABLE ${offersTable} (
          id text PRIMARY KEY,
          productId text NOT NULL,
          name text NOT NULL,
          description text NULL,
          currency "Currency" NOT NULL DEFAULT 'BRL',
          priceCents integer NOT NULL,
          maxInstallments integer NULL DEFAULT 1,
          installmentMinCents integer NULL,
          active boolean NOT NULL DEFAULT true,
          isSubscription boolean NOT NULL DEFAULT false,
          intervalCount integer NULL,
          intervalUnit "SubscriptionInterval" NULL,
          trialDays integer NULL,
          checkoutUrl text NULL,
          createdAt timestamptz NOT NULL DEFAULT now(),
          updatedAt timestamptz NOT NULL DEFAULT now()
        );
      `);

      // FK and indexes
      await client.query(`
        ALTER TABLE ${offersTable}
        ADD CONSTRAINT offers_product_fkey FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE;
      `);
      await client.query(`CREATE INDEX offers_productId_idx ON ${offersTable}(productId);`);
      await client.query(`CREATE INDEX offers_isSubscription_idx ON ${offersTable}(isSubscription);`);
      await client.query(`CREATE INDEX offers_active_idx ON ${offersTable}(active);`);
    } else {
      console.log('[migrate] table offers already exists');
    }

    // 3) Create offer_payment_methods table
    const opmTable = 'offer_payment_methods';
    const opmExists = await client.query(existsTableSQL(opmTable));
    if (opmExists.rowCount === 0) {
      console.log('[migrate] creating table offer_payment_methods');
      await client.query(`
        CREATE TABLE ${opmTable} (
          id text PRIMARY KEY,
          offerId text NOT NULL,
          method "PaymentMethod" NOT NULL,
          active boolean NOT NULL DEFAULT true,
          feePercent double precision NULL
        );
      `);
      await client.query(`
        ALTER TABLE ${opmTable}
        ADD CONSTRAINT offer_payment_methods_offer_fkey FOREIGN KEY (offerId) REFERENCES ${offersTable}(id) ON DELETE CASCADE;
      `);
      await client.query(`CREATE UNIQUE INDEX offer_payment_methods_offer_method_key ON ${opmTable}(offerId, method);`);
      await client.query(`CREATE INDEX offer_payment_methods_offerId_idx ON ${opmTable}(offerId);`);
    } else {
      console.log('[migrate] table offer_payment_methods already exists');
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
