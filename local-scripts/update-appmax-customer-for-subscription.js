#!/usr/bin/env node
const { PrismaClient } = require('@prisma/client');

/*
Usage examples:
  SUBSCRIPTION_ID=cmido74ja0004ia596un5ecsg APPMAX_CUSTOMER_ID=33480 node local-scripts/update-appmax-customer-for-subscription.js
  node local-scripts/update-appmax-customer-for-subscription.js --subscription=cmido74ja0004ia596un5ecsg --customerId=33480
Defaults (will be used if not provided):
  SUBSCRIPTION_ID: cmido74ja0004ia596un5ecsg
  APPMAX_CUSTOMER_ID: 33480
*/

async function main() {
  const prisma = new PrismaClient();
  try {
    const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
    const SUBSCRIPTION_ID = process.env.SUBSCRIPTION_ID || arg('subscription') || 'cmido74ja0004ia596un5ecsg';
    const APPMAX_CUSTOMER_ID = process.env.APPMAX_CUSTOMER_ID || arg('customerId') || '33480';

    if (!SUBSCRIPTION_ID) throw new Error('Missing SUBSCRIPTION_ID (env or --subscription=)');
    if (!APPMAX_CUSTOMER_ID) throw new Error('Missing APPMAX_CUSTOMER_ID (env or --customerId=)');

    const existing = await prisma.customerSubscription.findUnique({ where: { id: SUBSCRIPTION_ID } });
    if (!existing) throw new Error(`Subscription not found: ${SUBSCRIPTION_ID}`);

    const newMeta = { ...(existing.metadata || {}), appmaxCustomerId: String(APPMAX_CUSTOMER_ID) };
    const updated = await prisma.customerSubscription.update({
      where: { id: SUBSCRIPTION_ID },
      data: { metadata: newMeta },
      select: { id: true, metadata: true }
    });

    console.log('✅ Updated subscription metadata:', updated.id);
    console.log('appmaxCustomerId:', updated.metadata?.appmaxCustomerId);
  } catch (e) {
    console.error('[update] Error:', e?.message || e);
    process.exitCode = 1;
  } finally {
    try { await new PrismaClient().$disconnect(); } catch {}
  }
}

main();
