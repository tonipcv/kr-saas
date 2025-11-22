#!/usr/bin/env node
/*
Usage:
  OFFER_ID=<offerId> node scripts/check-merchant-integrations.js
*/
const { PrismaClient } = require('@prisma/client');

(async function main() {
  const prisma = new PrismaClient();
  try {
    const offerId = process.env.OFFER_ID;
    if (!offerId) {
      console.error('[check-merchant-integrations] Please provide OFFER_ID env');
      process.exit(2);
    }

    console.log(`[check] offerId=${offerId}`);
    
    // Get offer -> product -> clinic -> merchant
    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      select: { 
        productId: true,
        product: { 
          select: { 
            clinicId: true,
            clinic: {
              select: {
                id: true,
                name: true,
                slug: true
              }
            }
          } 
        } 
      }
    });
    
    if (!offer?.product?.clinicId) {
      console.log('No clinic found for offer');
      return;
    }

    const clinicId = offer.product.clinicId;
    console.log(`Clinic: ${offer.product.clinic?.name} (${clinicId})`);

    const merchant = await prisma.merchant.findUnique({
      where: { clinicId: clinicId },
      select: { id: true, recipientId: true }
    });
    
    if (!merchant) {
      console.log('No merchant found for clinic');
      return;
    }

    console.log(`Merchant: ${merchant.id}, recipientId: ${merchant.recipientId}`);

    // Check merchant integrations
    const integrations = await prisma.merchantIntegration.findMany({
      where: { merchantId: merchant.id },
      select: { 
        provider: true, 
        isActive: true, 
        connectedAt: true,
        credentials: true
      }
    });
    
    console.log('\n=== MERCHANT INTEGRATIONS ===');
    if (integrations.length === 0) {
      console.log('No integrations found');
    } else {
      for (const i of integrations) {
        const hasCredentials = !!(i.credentials && Object.keys(i.credentials).length > 0);
        console.log(`${i.provider}: active=${i.isActive}, connected=${!!i.connectedAt}, hasCredentials=${hasCredentials}`);
      }
    }

  } catch (e) {
    console.error('[check-merchant-integrations] error', e);
    process.exit(1);
  } finally {
    try { await prisma.$disconnect(); } catch {}
  }
})();
