#!/usr/bin/env node
/*
 * Migration: Merchant Onboarding (applications, documents, enums, user gating)
 * - Creates enums: "MerchantType", "MerchantAppStatus", "DocumentType", "DocumentStatus"
 * - Creates tables: merchant_applications, merchant_documents (idempotent)
 * - Adds column: access_granted on "User"
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
  // Try: url = env("DATABASE_URL") or direct string
  const envRef = schemaContent.match(/url\s*=\s*env\("([^"]+)"\)/);
  if (envRef && process.env[envRef[1]]) return process.env[envRef[1]];
  const direct = schemaContent.match(/datasource\s+db\s*\{[\s\S]*?url\s*=\s*"([^"]+)"/);
  return direct ? direct[1] : null;
}

async function run() {
  // Load .env
  try {
    const dotenv = require('dotenv');
    dotenv.config({ path: path.resolve(process.cwd(), '.env') });
    try { dotenv.config({ path: path.resolve(process.cwd(), '.env.local') }); } catch {}
  } catch {}

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
  const existsColumnSQL = (table, column) => `select 1 from information_schema.columns where table_name='${table}' and column_name='${column}' limit 1`;
  const existsIndexSQL = (schema, indexName) => `select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='i' and c.relname='${indexName}' and n.nspname='${schema}' limit 1`;
  const existsFunctionSQL = (name) => `select 1 from pg_proc where proname='${name}' limit 1`;
  const existsTriggerSQL = (name) => `select 1 from information_schema.triggers where trigger_name='${name}' limit 1`;

  try {
    console.log('[migrate] starting transaction');
    await client.query('BEGIN');

    // 1) Enums
    const enums = [
      { name: 'MerchantType', create: `CREATE TYPE "MerchantType" AS ENUM ('INDIVIDUAL','COMPANY')` },
      { name: 'MerchantAppStatus', create: `CREATE TYPE "MerchantAppStatus" AS ENUM ('DRAFT','PENDING_DOCUMENTS','UNDER_REVIEW','APPROVED','REJECTED')` },
      { name: 'DocumentType', create: `CREATE TYPE "DocumentType" AS ENUM ('ID_FRONT','ID_BACK','SELFIE','CNPJ_CARD','ADDRESS_PROOF','CONTRACT_SOCIAL','BANK_STATEMENT','OTHER')` },
      { name: 'DocumentStatus', create: `CREATE TYPE "DocumentStatus" AS ENUM ('PENDING','APPROVED','REJECTED')` },
    ];
    for (const e of enums) {
      const r = await client.query(existsEnumSQL(e.name));
      if (r.rowCount === 0) {
        console.log('[migrate] creating enum', e.name);
        await client.query(e.create);
      } else {
        console.log('[migrate] enum exists', e.name);
      }
    }

    // 2) merchant_applications
    const maTable = 'merchant_applications';
    const maExists = await client.query(existsTableSQL(maTable));
    if (maExists.rowCount === 0) {
      console.log('[migrate] creating table', maTable);
      await client.query(`
        CREATE TABLE ${maTable} (
          id           text PRIMARY KEY,
          clinic_id    text UNIQUE NOT NULL,
          type         "MerchantType" NOT NULL DEFAULT 'INDIVIDUAL',
          "businessName" text,
          "fullName"     text,
          "documentNumber" text,
          email        text,
          phone        text,
          address      jsonb,
          "bankAccount"  jsonb,
          recipient_id text,
          status       "MerchantAppStatus" NOT NULL DEFAULT 'DRAFT',
          "reviewNotes"  text,
          "reviewedBy"   text,
          "reviewedAt"   timestamp with time zone,
          "createdAt"    timestamp with time zone NOT NULL DEFAULT now(),
          "updatedAt"    timestamp with time zone NOT NULL DEFAULT now(),
          CONSTRAINT fk_merchant_app_clinic FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE
        )
      `);
    } else {
      console.log('[migrate] table exists', maTable);
    }

    // 3) merchant_documents
    const mdTable = 'merchant_documents';
    const mdExists = await client.query(existsTableSQL(mdTable));
    if (mdExists.rowCount === 0) {
      console.log('[migrate] creating table', mdTable);
      await client.query(`
        CREATE TABLE ${mdTable} (
          id             text PRIMARY KEY,
          application_id text NOT NULL,
          type           "DocumentType" NOT NULL,
          file_url       text NOT NULL,
          status         "DocumentStatus" NOT NULL DEFAULT 'PENDING',
          notes          text,
          uploaded_at    timestamp with time zone NOT NULL DEFAULT now(),
          reviewed_at    timestamp with time zone,
          CONSTRAINT fk_doc_application FOREIGN KEY (application_id) REFERENCES ${maTable}(id) ON DELETE CASCADE
        )
      `);
      // index
      await client.query(`CREATE INDEX idx_merchant_documents_application ON ${mdTable}(application_id)`);
    } else {
      console.log('[migrate] table exists', mdTable);
      // ensure index exists
      const idxExists = await client.query(existsIndexSQL('public', 'idx_merchant_documents_application'));
      if (idxExists.rowCount === 0) {
        console.log('[migrate] creating index idx_merchant_documents_application');
        await client.query(`CREATE INDEX idx_merchant_documents_application ON ${mdTable}(application_id)`);
      }
    }

    // 4) Add access_granted to User
    const userTable = 'User';
    const agExists = await client.query(existsColumnSQL(userTable, 'access_granted'));
    if (agExists.rowCount === 0) {
      console.log('[migrate] adding column User.access_granted');
      await client.query('ALTER TABLE "User" ADD COLUMN access_granted boolean NOT NULL DEFAULT false');
    } else {
      console.log('[migrate] column exists User.access_granted');
    }

    // 5) Trigger for updatedAt on merchant_applications
    const fnExists = await client.query(existsFunctionSQL('trg_set_timestamp'));
    if (fnExists.rowCount === 0) {
      console.log('[migrate] creating function trg_set_timestamp');
      await client.query(`
        CREATE OR REPLACE FUNCTION trg_set_timestamp()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW."updatedAt" = NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);
    } else {
      console.log('[migrate] function exists trg_set_timestamp');
    }

    const trgExists = await client.query(existsTriggerSQL('set_timestamp_merchant_applications'));
    if (trgExists.rowCount === 0) {
      console.log('[migrate] creating trigger set_timestamp_merchant_applications');
      await client.query(`
        CREATE TRIGGER set_timestamp_merchant_applications
        BEFORE UPDATE ON ${maTable}
        FOR EACH ROW EXECUTE FUNCTION trg_set_timestamp();
      `);
    } else {
      console.log('[migrate] trigger exists set_timestamp_merchant_applications');
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
