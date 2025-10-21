#!/usr/bin/env node
/*
 * Backfill: Create default Offers from legacy product fields
 * - For each product:
 *   - Ensure a one-off Offer exists (isSubscription = false) with priceCents from products.price
 *   - If product.type = SUBSCRIPTION and has interval/intervalCount/trialDays, ensure a subscription Offer exists
 *
 * Safe to run multiple times: checks for existing offers per product and type to avoid duplicates.
 */

require('dotenv').config();
const { PrismaClient, ProductType } = require('@prisma/client');

const prisma = new PrismaClient();

function toCents(decimalLike) {
  if (decimalLike == null) return null;
  // Prisma Decimal may come as object with toString
  const n = parseFloat(decimalLike.toString());
  if (Number.isNaN(n)) return null;
  return Math.round(n * 100);
}

async function backfill() {
  const BATCH = 200;
  let createdOffers = 0;
  let skipped = 0;

  const totalProducts = await prisma.products.count();
  console.log(`[backfill] total products: ${totalProducts}`);

  for (let skip = 0; skip < totalProducts; skip += BATCH) {
    const products = await prisma.products.findMany({
      skip,
      take: BATCH,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        type: true,
        interval: true,
        intervalCount: true,
        trialDays: true,
      },
    });

    for (const p of products) {
      const existing = await prisma.offer.findMany({
        where: { productId: p.id },
        select: { id: true, isSubscription: true },
      });

      const hasOneOff = existing.some((o) => !o.isSubscription);
      const hasSubscription = existing.some((o) => o.isSubscription);

      // One-off offer
      if (!hasOneOff) {
        const priceCents = toCents(p.price);
        if (priceCents != null) {
          await prisma.offer.create({
            data: {
              productId: p.id,
              name: `${p.name} - Pagamento único`,
              description: p.description || undefined,
              priceCents,
              isSubscription: false,
              active: true,
              maxInstallments: 1,
            },
          });
          createdOffers++;
        } else {
          skipped++;
          console.log(`[backfill] skipped one-off for product ${p.id}: missing/invalid price`);
        }
      }

      // Subscription offer
      const isSub = p.type === ProductType.SUBSCRIPTION;
      const hasInterval = !!p.interval;
      if (isSub && hasInterval && !hasSubscription) {
        const priceCents = toCents(p.price);
        await prisma.offer.create({
          data: {
            productId: p.id,
            name: `${p.name} - Assinatura`,
            description: p.description || undefined,
            priceCents: priceCents ?? 0,
            isSubscription: true,
            intervalUnit: p.interval, // uses existing SubscriptionInterval enum
            intervalCount: p.intervalCount ?? 1,
            trialDays: p.trialDays ?? undefined,
            active: true,
          },
        });
        createdOffers++;
      }
    }
  }

  console.log(`[backfill] created offers: ${createdOffers}, skipped: ${skipped}`);
}

backfill()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error('[backfill] error:', e);
    return prisma.$disconnect().then(() => process.exit(1));
  });
