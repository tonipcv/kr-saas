#!/usr/bin/env node
/*
Usage:
  OFFER_ID=<offerId> node scripts/check-routing-rules.js
*/
const { PrismaClient } = require('@prisma/client');

(async function main() {
  const prisma = new PrismaClient();
  try {
    const offerId = process.env.OFFER_ID;
    if (!offerId) {
      console.error('[check-routing-rules] Please provide OFFER_ID env');
      process.exit(2);
    }

    console.log(`[check] offerId=${offerId}`);
    
    // Check routing rules for this offer
    const rules = await prisma.paymentRoutingRule.findMany({
      where: {
        OR: [
          { offerId: offerId },
          { productId: { not: null } }, // product-level rules
          { offerId: null, productId: null }, // global rules
        ]
      },
      orderBy: [{ priority: 'asc' }],
    });

    console.log('\n=== ROUTING RULES ===');
    if (rules.length === 0) {
      console.log('No routing rules found');
    } else {
      for (const r of rules) {
        const scope = r.offerId ? `offer:${r.offerId}` : (r.productId ? `product:${r.productId}` : 'global');
        console.log(`${scope} | ${r.country || 'ANY'} | ${r.method || 'ANY'} | ${r.provider} | active:${r.isActive} | priority:${r.priority}`);
      }
    }

    // Check merchant integrations
    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      select: { productId: true, product: { select: { clinicId: true } } }
    });
    
    if (offer?.product?.clinicId) {
      const merchant = await prisma.merchant.findUnique({
        where: { clinicId: offer.product.clinicId },
        select: { id: true }
      });
      
      if (merchant?.id) {
        const integrations = await prisma.merchantIntegration.findMany({
          where: { merchantId: merchant.id },
          select: { provider: true, isActive: true }
        });
        
        console.log('\n=== MERCHANT INTEGRATIONS ===');
        for (const i of integrations) {
          console.log(`${i.provider}: ${i.isActive ? 'ACTIVE' : 'INACTIVE'}`);
        }
      }
    }

  } catch (e) {
    console.error('[check-routing-rules] error', e);
    process.exit(1);
  } finally {
    try { await prisma.$disconnect(); } catch {}
  }
})();
