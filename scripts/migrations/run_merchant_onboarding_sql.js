#!/usr/bin/env node
/*
 * Direct SQL migration for Merchant Onboarding (no Prisma migrate).
 * - Creates enums: MerchantType, MerchantAppStatus, DocumentType, DocumentStatus
 * - Creates tables: merchant_applications, merchant_documents
 * - Adds column: access_granted to "User"
 * Requires: DATABASE_URL in environment and psql installed.
 */
const { execSync } = require('child_process');
const path = require('path');

// Load .env
try {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
  try { dotenv.config({ path: path.resolve(process.cwd(), '.env.local') }); } catch {}
} catch {}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('ERROR: DATABASE_URL is not set. Define it in .env or environment.');
  process.exit(1);
}

const SQL = `
-- Enums
DO $$ BEGIN
  IF to_regtype('"MerchantType"') IS NULL THEN
    CREATE TYPE "MerchantType" AS ENUM ('INDIVIDUAL','COMPANY');
  END IF;
END $$;

DO $$ BEGIN
  IF to_regtype('"MerchantAppStatus"') IS NULL THEN
    CREATE TYPE "MerchantAppStatus" AS ENUM ('DRAFT','PENDING_DOCUMENTS','UNDER_REVIEW','APPROVED','REJECTED');
  END IF;
END $$;

DO $$ BEGIN
  IF to_regtype('"DocumentType"') IS NULL THEN
    CREATE TYPE "DocumentType" AS ENUM ('ID_FRONT','ID_BACK','SELFIE','CNPJ_CARD','ADDRESS_PROOF','CONTRACT_SOCIAL','BANK_STATEMENT','OTHER');
  END IF;
END $$;

DO $$ BEGIN
  IF to_regtype('"DocumentStatus"') IS NULL THEN
    CREATE TYPE "DocumentStatus" AS ENUM ('PENDING','APPROVED','REJECTED');
  END IF;
END $$;

-- Table: merchant_applications
CREATE TABLE IF NOT EXISTS merchant_applications (
  id           text PRIMARY KEY,
  clinic_id    text UNIQUE NOT NULL,
  type         "MerchantType" NOT NULL DEFAULT 'INDIVIDUAL',
  businessName text,
  fullName     text,
  documentNumber text,
  email        text,
  phone        text,
  address      jsonb,
  bankAccount  jsonb,
  recipient_id text,
  status       "MerchantAppStatus" NOT NULL DEFAULT 'DRAFT',
  reviewNotes  text,
  reviewedBy   text,
  reviewedAt   timestamp with time zone,
  createdAt    timestamp with time zone NOT NULL DEFAULT now(),
  updatedAt    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT fk_merchant_app_clinic FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE
);

-- Table: merchant_documents
CREATE TABLE IF NOT EXISTS merchant_documents (
  id             text PRIMARY KEY,
  application_id text NOT NULL,
  type           "DocumentType" NOT NULL,
  file_url       text NOT NULL,
  status         "DocumentStatus" NOT NULL DEFAULT 'PENDING',
  notes          text,
  uploaded_at    timestamp with time zone NOT NULL DEFAULT now(),
  reviewed_at    timestamp with time zone,
  CONSTRAINT fk_doc_application FOREIGN KEY (application_id) REFERENCES merchant_applications(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_merchant_documents_application ON merchant_documents(application_id);

-- Add column to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS access_granted boolean NOT NULL DEFAULT false;

-- Trigger to update updatedAt on merchant_applications
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'trg_set_timestamp') THEN
    CREATE OR REPLACE FUNCTION trg_set_timestamp()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW."updatedAt" = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'set_timestamp_merchant_applications') THEN
    CREATE TRIGGER set_timestamp_merchant_applications
    BEFORE UPDATE ON merchant_applications
    FOR EACH ROW EXECUTE FUNCTION trg_set_timestamp();
  END IF;
END $$;
`;

function runPsql(sql) {
  const cmd = `psql \"${dbUrl}\" -v ON_ERROR_STOP=1 -q -c ${JSON.stringify(sql)}`;
  console.log(`\n$ ${cmd.replace(/".*@/,'"***@').replace(/:(\d+)\//,':****/').replace(/password=[^\s"']+/,'password=****')}`);
  execSync(cmd, { stdio: 'inherit', env: process.env });
}

try {
  runPsql(SQL);
  console.log('\nSQL migration applied successfully.');
} catch (e) {
  console.error('\nSQL migration failed.', e?.message || e);
  process.exit(1);
}
