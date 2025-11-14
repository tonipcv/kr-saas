/*
  DDL: Add audit fields to payment_transactions
  - paid_at, captured_at, refund_status, refunded_at, routed_provider
  - helpful indexes

  Usage:
    DATABASE_URL=postgres://... node scripts/ddl_add_payment_tx_audit_fields.js
*/

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('[ddl] starting migration for payment_transactions audit fields');

    const statements = [
      `ALTER TABLE payment_transactions
         ADD COLUMN IF NOT EXISTS paid_at timestamptz,
         ADD COLUMN IF NOT EXISTS captured_at timestamptz,
         ADD COLUMN IF NOT EXISTS refund_status text,
         ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
         ADD COLUMN IF NOT EXISTS routed_provider text;`,

      // Indexes (IF NOT EXISTS is supported in recent Postgres versions)
      `CREATE INDEX IF NOT EXISTS idx_payment_tx_status ON payment_transactions(status);`,
      `CREATE INDEX IF NOT EXISTS idx_payment_tx_paid_at ON payment_transactions(paid_at);`,
      `CREATE INDEX IF NOT EXISTS idx_payment_tx_routed_provider ON payment_transactions(routed_provider);`,
    ];

    for (const sql of statements) {
      console.log('[ddl] executing:', sql.replace(/\s+/g, ' ').trim().slice(0, 140) + '...');
      await prisma.$executeRawUnsafe(sql);
    }

    console.log('[ddl] migration completed successfully');
  } catch (e) {
    console.error('[ddl] migration failed:', e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
