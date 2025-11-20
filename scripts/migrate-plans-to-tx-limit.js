/*
 Add monthly_tx_limit to clinic_plans, drop base_doctors/base_patients,
 and add helpful indexes for counting monthly PaymentTransaction rows.

 Usage:
   node scripts/migrate-plans-to-tx-limit.js
*/

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const statements = [
  // 1) Add new column with default
  `ALTER TABLE clinic_plans ADD COLUMN IF NOT EXISTS monthly_tx_limit INT NOT NULL DEFAULT 1000;`,
  // 2) Drop legacy columns
  `ALTER TABLE clinic_plans DROP COLUMN IF EXISTS base_doctors;`,
  `ALTER TABLE clinic_plans DROP COLUMN IF EXISTS base_patients;`,
  // 3) Performance indexes for counting
  `CREATE INDEX IF NOT EXISTS idx_payment_tx_clinic_created ON payment_transactions (clinic_id, created_at);`,
  `CREATE INDEX IF NOT EXISTS idx_payment_tx_clinic_status_created ON payment_transactions (clinic_id, status_v2, created_at);`,
];

async function main() {
  console.log('[migrate] Starting plans->monthly_tx_limit migration...');
  await prisma.$executeRawUnsafe('BEGIN');
  try {
    for (const sql of statements) {
      console.log('[migrate] Executing:', sql.replace(/\s+/g, ' ').trim());
      await prisma.$executeRawUnsafe(sql);
    }
    await prisma.$executeRawUnsafe('COMMIT');
    console.log('[migrate] Done.');
  } catch (e) {
    console.error('[migrate] Error, rolling back.', e);
    try { await prisma.$executeRawUnsafe('ROLLBACK'); } catch {}
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
