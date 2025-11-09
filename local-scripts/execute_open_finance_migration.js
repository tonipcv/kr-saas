#!/usr/bin/env node
/**
 * Execute Open Finance additive SQL migration via Node.js (pg driver).
 * - Loads DATABASE_URL from .env.local/.env or environment.
 * - Runs a single transaction with additive-only SQL (no drops/renames of existing PagarMe tables).
 *
 * Usage:
 *   node local-scripts/execute_open_finance_migration.js       # run
 *   DRY_RUN=1 node local-scripts/execute_open_finance_migration.js  # print SQL only
 */

const process = require('node:process');

// Load env from .env.local then .env (if available)
try { require('dotenv').config({ path: '.env.local' }); } catch {}
try { require('dotenv').config({ path: '.env' }); } catch {}

const { Client } = require('pg');

const SQL = `
BEGIN;
-- Ensure required extension for gen_random_uuid
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Create table: openbanking_consents (additive)
CREATE TABLE IF NOT EXISTS openbanking_consents (
  id                     UUID        NOT NULL DEFAULT gen_random_uuid(),
  enrollment_id          TEXT,
  consent_id             TEXT        NOT NULL,
  amount_cents           INTEGER,
  currency               TEXT,
  creditor_name          TEXT,
  creditor_cpf_cnpj      TEXT,
  product_id             TEXT,
  clinic_id              TEXT,
  status                 TEXT,
  provider_response_json JSONB,
  created_at             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT openbanking_consents_pkey PRIMARY KEY (id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'openbanking_consents_consent_id_key'
  ) THEN
    CREATE UNIQUE INDEX openbanking_consents_consent_id_key
      ON openbanking_consents (consent_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'openbanking_consents_consent_id_idx'
  ) THEN
    CREATE INDEX openbanking_consents_consent_id_idx
      ON openbanking_consents (consent_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'openbanking_consents_enrollment_id_idx'
  ) THEN
    CREATE INDEX openbanking_consents_enrollment_id_idx
      ON openbanking_consents (enrollment_id);
  END IF;
END$$;

-- 2) Create/extend table: payment_customers (non-clinical buyer profile)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payment_customers'
  ) THEN
    CREATE TABLE payment_customers (
      id           TEXT        NOT NULL,
      user_id      TEXT,
      clinic_id    TEXT,
      email        TEXT,
      document     TEXT,
      full_name    TEXT,
      phones_json  TEXT,
      created_at   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT payment_customers_pkey PRIMARY KEY (id)
    );
  ELSE
    -- Table exists: ensure required columns are present (additive)
    BEGIN
      ALTER TABLE payment_customers ADD COLUMN IF NOT EXISTS user_id     TEXT;
      ALTER TABLE payment_customers ADD COLUMN IF NOT EXISTS clinic_id   TEXT;
      ALTER TABLE payment_customers ADD COLUMN IF NOT EXISTS email       TEXT;
      ALTER TABLE payment_customers ADD COLUMN IF NOT EXISTS document    TEXT;
      ALTER TABLE payment_customers ADD COLUMN IF NOT EXISTS full_name   TEXT;
      ALTER TABLE payment_customers ADD COLUMN IF NOT EXISTS phones_json TEXT;
      ALTER TABLE payment_customers ADD COLUMN IF NOT EXISTS created_at  TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE payment_customers ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
    EXCEPTION WHEN duplicate_column THEN
      -- ignore
      NULL;
    END;
  END IF;
  -- Skip index creation for payment_customers to avoid race on varying schemas
END$$;

-- 3) Extend enrollment_contexts (buyer/device/audit)
ALTER TABLE enrollment_contexts
  ADD COLUMN IF NOT EXISTS clinic_id               TEXT,
  ADD COLUMN IF NOT EXISTS payer_email             TEXT,
  ADD COLUMN IF NOT EXISTS payer_document          TEXT,
  ADD COLUMN IF NOT EXISTS payer_name              TEXT,
  ADD COLUMN IF NOT EXISTS recurring_enabled       BOOLEAN,
  ADD COLUMN IF NOT EXISTS device_binding_json     JSONB,
  ADD COLUMN IF NOT EXISTS provider_response_json  JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'enrollment_contexts_user_id_created_at_idx'
  ) THEN
    CREATE INDEX enrollment_contexts_user_id_created_at_idx
      ON enrollment_contexts (user_id, created_at);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'enrollment_contexts_session_id_created_at_idx'
  ) THEN
    CREATE INDEX enrollment_contexts_session_id_created_at_idx
      ON enrollment_contexts (session_id, created_at);
  END IF;
END$$;

-- 4) Extend openbanking_payments (payer/creditor/audit/recurring)
ALTER TABLE openbanking_payments
  ADD COLUMN IF NOT EXISTS enrollment_id               TEXT,
  ADD COLUMN IF NOT EXISTS transaction_identification  TEXT,
  ADD COLUMN IF NOT EXISTS payer_id                    TEXT,
  ADD COLUMN IF NOT EXISTS payer_document              TEXT,
  ADD COLUMN IF NOT EXISTS payer_email                 TEXT,
  ADD COLUMN IF NOT EXISTS payer_name                  TEXT,
  ADD COLUMN IF NOT EXISTS creditor_name               TEXT,
  ADD COLUMN IF NOT EXISTS creditor_cpf_cnpj           TEXT,
  ADD COLUMN IF NOT EXISTS clinic_id                   TEXT,
  ADD COLUMN IF NOT EXISTS product_id                  TEXT,
  ADD COLUMN IF NOT EXISTS purchase_id                 TEXT,
  ADD COLUMN IF NOT EXISTS type                        TEXT,
  ADD COLUMN IF NOT EXISTS executed_at                 TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS settled_at                  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS recurrence_type             TEXT,
  ADD COLUMN IF NOT EXISTS subscription_id             TEXT,
  ADD COLUMN IF NOT EXISTS execution_order             INTEGER,
  ADD COLUMN IF NOT EXISTS provider_response_json      JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'openbanking_payments_consent_id_idx'
  ) THEN
    CREATE INDEX openbanking_payments_consent_id_idx
      ON openbanking_payments (consent_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'openbanking_payments_payer_document_idx'
  ) THEN
    CREATE INDEX openbanking_payments_payer_document_idx
      ON openbanking_payments (payer_document);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'openbanking_payments_clinic_id_idx'
  ) THEN
    CREATE INDEX openbanking_payments_clinic_id_idx
      ON openbanking_payments (clinic_id);
  END IF;
END$$;

COMMIT;
`;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[fatal] DATABASE_URL is not set.');
    process.exit(1);
  }

  if (process.env.DRY_RUN) {
    console.log('--- DRY RUN (SQL below will not execute) ---');
    console.log(SQL);
    return;
  }

  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    await client.query(SQL);
    console.log('Open Finance additive migration executed successfully.');
  } catch (e) {
    console.error('[error] Migration failed:', e?.message || e);
    process.exitCode = 1;
  } finally {
    try { await client.end(); } catch {}
  }
}

main();
