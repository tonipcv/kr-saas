#!/usr/bin/env node
/*
  Quick runtime test for merchants schema and Prisma mapping.
  Usage: node scripts/debug/test_merchant_upsert.js <clinicId>
*/

const { prisma } = require('../../dist/lib/prisma.js');

async function main() {
  const clinicId = process.argv[2];
  if (!clinicId) {
    console.error('Usage: node scripts/debug/test_merchant_upsert.js <clinicId>');
    process.exit(1);
  }

  console.log('[debug] DATABASE_URL:', process.env.DATABASE_URL ? '(set)' : '(missing)');

  console.log('[debug] Listing merchants columns...');
  const cols = await prisma.$queryRawUnsafe(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'merchants'
    ORDER BY 1;
  `);
  console.table(cols);

  try {
    console.log('[debug] Upserting merchant...');
    const m = await prisma.merchant.upsert({
      where: { clinicId },
      update: { status: 'PENDING' },
      create: { clinicId, status: 'PENDING' },
      select: { clinicId: true, status: true, recipientId: true, onboardingState: true },
    });
    console.log('[debug] Upsert OK:', m);
  } catch (e) {
    console.error('[debug] Upsert error:', e);
  }
}

main()
  .catch((e) => { console.error('[debug] Fatal:', e); process.exit(1); })
  .finally(async () => { try { await prisma.$disconnect(); } catch {} });
