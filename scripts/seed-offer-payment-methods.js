#!/usr/bin/env node
/*
 * Seed OfferPaymentMethod for all existing offers
 * - Adds PIX and CARD as active methods by default
 * - Idempotent: avoids duplicates with unique(offerId, method)
 */
require('dotenv').config();
const { PrismaClient, PaymentMethod } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const BATCH = 200;
  const total = await prisma.offer.count();
  console.log('[seed-opm] total offers:', total);
  let created = 0;

  for (let skip = 0; skip < total; skip += BATCH) {
    const offers = await prisma.offer.findMany({ skip, take: BATCH, select: { id: true } });
    for (const o of offers) {
      for (const method of [PaymentMethod.PIX, PaymentMethod.CARD]) {
        try {
          await prisma.offerPaymentMethod.upsert({
            where: { offerId_method: { offerId: o.id, method } },
            update: { active: true },
            create: { offerId: o.id, method, active: true },
          });
          created++;
        } catch (e) {
          // unique constraint or other issues; continue
        }
      }
    }
  }
  console.log('[seed-opm] upserts (created or ensured):', created);
}

run().then(() => prisma.$disconnect()).catch((e) => {
  console.error('[seed-opm] error:', e);
  return prisma.$disconnect().then(() => process.exit(1));
});
