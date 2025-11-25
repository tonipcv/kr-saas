#!/usr/bin/env node
const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  try {
    const MERCHANT_ID = process.env.MERCHANT_ID || process.argv.find(a=>a.startsWith('--merchant='))?.split('=')[1];
    const APPMAX_API_KEY = process.env.APPMAX_API_KEY || process.argv.find(a=>a.startsWith('--apiKey='))?.split('=')[1];
    const TEST_MODE = String(process.env.TEST_MODE || process.argv.find(a=>a.startsWith('--testMode='))?.split('=')[1] || 'true').toLowerCase() === 'true';

    if (!MERCHANT_ID) throw new Error('Missing MERCHANT_ID (env or --merchant=)');
    if (!APPMAX_API_KEY) throw new Error('Missing APPMAX_API_KEY (env or --apiKey=)');

    const integ = await prisma.merchantIntegration.upsert({
      where: { merchantId_provider: { merchantId: MERCHANT_ID, provider: 'APPMAX' } },
      update: {
        credentials: { apiKey: APPMAX_API_KEY, testMode: TEST_MODE },
        isActive: true,
        isPrimary: true,
        lastError: null,
        lastErrorAt: null,
      },
      create: {
        merchantId: MERCHANT_ID,
        provider: 'APPMAX',
        credentials: { apiKey: APPMAX_API_KEY, testMode: TEST_MODE },
        config: {},
        isActive: true,
        isPrimary: true,
      },
      select: { merchantId: true, provider: true, isActive: true, credentials: true }
    });

    console.log('\n✅ Upserted merchant integration:', integ);
    console.log('\nYou can now re-run the Trigger.dev task appmax-renewal.');
  } catch (e) {
    console.error('[integration] Error:', e?.message || e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
