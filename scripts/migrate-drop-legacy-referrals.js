/*
 Drop legacy referrals/coupons models via Node.js (raw SQL).
 Safe to run multiple times: uses IF EXISTS and wraps in a transaction.

 Usage:
   node scripts/migrate-drop-legacy-referrals.js

 Requires DATABASE_URL to be configured for Prisma.
*/

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const statements = [
  // Drop dependent tables first where applicable
  `DROP TABLE IF EXISTS coupon_redemptions CASCADE;`,
  `DROP TABLE IF EXISTS referral_reward_codes CASCADE;`,
  `DROP TABLE IF EXISTS referral_credits CASCADE;`,
  `DROP TABLE IF EXISTS referral_form_settings CASCADE;`,
  `DROP TABLE IF EXISTS referral_leads CASCADE;`,
  `DROP TABLE IF EXISTS referral_rewards CASCADE;`,
  `DROP TABLE IF EXISTS leads CASCADE;`,
  `DROP TABLE IF EXISTS coupons CASCADE;`,
  `DROP TABLE IF EXISTS coupon_templates CASCADE;`,
  `DROP TABLE IF EXISTS referrals CASCADE;`,
];

async function main() {
  console.log('[migrate] Starting drop of legacy referral/coupon tables...');
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
