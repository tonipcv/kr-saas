#!/usr/bin/env node
/*
  Open Finance schema migration runner (idempotent-ish).
  - Creates enums if missing
  - Adds JSON columns to openbanking_payments
  - Casts String columns to Enums (status/type) where applicable
  - Creates indexes on key columns
  - Does NOT drop any tables (safe for PagarMe)

  Usage:
    node local-scripts/migrate_open_finance_schema.js

  Reads DATABASE_URL from .env/.env.local or environment.
*/

// Load env
try {
  const fs = require('fs');
  const dotenv = require('dotenv');
  if (fs.existsSync('.env.local')) dotenv.config({ path: '.env.local' });
  dotenv.config();
} catch {}

const { Client } = require('pg');

const SQL_STEPS = [
  // 1) Enums
  `DO $$ BEGIN CREATE TYPE "PaymentTypeOB" AS ENUM ('SINGLE','RECURRING'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `DO $$ BEGIN CREATE TYPE "PaymentStatusOB" AS ENUM ('PROCESSING','ACCP','PAGO','RJCT','CANC'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `DO $$ BEGIN CREATE TYPE "EnrollmentStatusOB" AS ENUM ('PENDING','AUTHORISED','REJECTED','REVOKED','EXPIRED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `DO $$ BEGIN CREATE TYPE "ConsentStatusOB" AS ENUM ('AWAITING_AUTHORISATION','AUTHORISED','REJECTED','CONSUMED','EXPIRED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,

  // 2) Add JSON columns (payments)
  `ALTER TABLE "openbanking_payments" ADD COLUMN IF NOT EXISTS "fido_assertion_json" JSONB;`,
  `ALTER TABLE "openbanking_payments" ADD COLUMN IF NOT EXISTS "risk_signals_json" JSONB;`,

  // 3) Convert types to enums (payments.type, payments.status)
  `ALTER TABLE "openbanking_payments" ALTER COLUMN "type" TYPE "PaymentTypeOB" USING CASE WHEN "type" = 'SINGLE' THEN 'SINGLE'::"PaymentTypeOB" WHEN "type" = 'RECURRING' THEN 'RECURRING'::"PaymentTypeOB" ELSE NULL END;`,
  `ALTER TABLE "openbanking_payments" ALTER COLUMN "status" TYPE "PaymentStatusOB" USING CASE WHEN "status" = 'PROCESSING' THEN 'PROCESSING'::"PaymentStatusOB" WHEN "status" = 'ACCP' THEN 'ACCP'::"PaymentStatusOB" WHEN "status" = 'PAGO' THEN 'PAGO'::"PaymentStatusOB" WHEN "status" = 'RJCT' THEN 'RJCT'::"PaymentStatusOB" WHEN "status" = 'CANC' THEN 'CANC'::"PaymentStatusOB" ELSE NULL END;`,

  // 4) Convert enums for enrollment_contexts.status and consents.status
  `ALTER TABLE "enrollment_contexts" ALTER COLUMN "status" TYPE "EnrollmentStatusOB" USING CASE WHEN "status" = 'PENDING' THEN 'PENDING'::"EnrollmentStatusOB" WHEN "status" = 'AUTHORISED' THEN 'AUTHORISED'::"EnrollmentStatusOB" WHEN "status" = 'REJECTED' THEN 'REJECTED'::"EnrollmentStatusOB" WHEN "status" = 'REVOKED' THEN 'REVOKED'::"EnrollmentStatusOB" WHEN "status" = 'EXPIRED' THEN 'EXPIRED'::"EnrollmentStatusOB" ELSE NULL END;`,
  `ALTER TABLE "openbanking_consents" ALTER COLUMN "status" TYPE "ConsentStatusOB" USING CASE WHEN "status" = 'AWAITING_AUTHORISATION' THEN 'AWAITING_AUTHORISATION'::"ConsentStatusOB" WHEN "status" = 'AUTHORISED' THEN 'AUTHORISED'::"ConsentStatusOB" WHEN "status" = 'REJECTED' THEN 'REJECTED'::"ConsentStatusOB" WHEN "status" = 'CONSUMED' THEN 'CONSUMED'::"ConsentStatusOB" WHEN "status" = 'EXPIRED' THEN 'EXPIRED'::"ConsentStatusOB" ELSE NULL END;`,

  // 5) Indexes (payments)
  `CREATE INDEX IF NOT EXISTS "idx_ob_payments_enrollment" ON "openbanking_payments"("enrollment_id");`,
  `CREATE INDEX IF NOT EXISTS "idx_ob_payments_payer" ON "openbanking_payments"("payer_id");`,
  `CREATE INDEX IF NOT EXISTS "idx_ob_payments_clinic" ON "openbanking_payments"("clinic_id");`,
  `CREATE INDEX IF NOT EXISTS "idx_ob_payments_status" ON "openbanking_payments"("status");`,
  `CREATE INDEX IF NOT EXISTS "idx_ob_payments_executed" ON "openbanking_payments"("executed_at");`,
  `CREATE INDEX IF NOT EXISTS "idx_ob_payments_provider_id" ON "openbanking_payments"("provider_payment_id");`,
  `CREATE INDEX IF NOT EXISTS "idx_ob_payments_type" ON "openbanking_payments"("type");`,

  // 6) Indexes (enrollments)
  `CREATE INDEX IF NOT EXISTS "idx_enrollment_enrollment_id" ON "enrollment_contexts"("enrollment_id");`,
  `CREATE INDEX IF NOT EXISTS "idx_enrollment_clinic" ON "enrollment_contexts"("clinic_id");`,
  `CREATE INDEX IF NOT EXISTS "idx_enrollment_status" ON "enrollment_contexts"("status");`,
  `CREATE INDEX IF NOT EXISTS "idx_enrollment_device" ON "enrollment_contexts"("device_registered");`,
  `CREATE INDEX IF NOT EXISTS "idx_enrollment_recurring" ON "enrollment_contexts"("recurring_enabled");`,

  // 7) Indexes (consents)
  `CREATE INDEX IF NOT EXISTS "idx_ob_consents_status" ON "openbanking_consents"("status");`,
  `CREATE INDEX IF NOT EXISTS "idx_ob_consents_product" ON "openbanking_consents"("product_id");`,
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[migrate_open_finance_schema] DATABASE_URL is not set');
    process.exit(1);
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    console.log('== Open Finance Migration ==');
    for (let i = 0; i < SQL_STEPS.length; i++) {
      const sql = SQL_STEPS[i];
      try {
        await client.query(sql);
        console.log(`Step ${i + 1}/${SQL_STEPS.length} OK`);
      } catch (e) {
        console.warn(`Step ${i + 1} skipped/failed:`, e.message);
      }
    }
    console.log('Done.');
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
