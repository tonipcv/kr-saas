#!/usr/bin/env node
/**
 * Inspect webhook events and payment transactions quickly.
 *
 * Usage examples:
 *   node scripts/inspect-payments.js                      # latest 20 of each
 *   node scripts/inspect-payments.js --order or_123       # filter by order id
 *   node scripts/inspect-payments.js --charge ch_123      # filter by charge id
 *   node scripts/inspect-payments.js --limit 50           # change limit
 */

const { PrismaClient } = require('@prisma/client');

function getArg(flag, fallback = undefined) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  if (!v || v.startsWith('--')) return true; // boolean flag
  return v;
}

async function main() {
  const prisma = new PrismaClient();
  const orderId = getArg('--order') || getArg('-o');
  const chargeId = getArg('--charge') || getArg('-c');
  const limit = parseInt(getArg('--limit', '20'), 10) || 20;

  console.log('[inspect] Filters:', { orderId, chargeId, limit });

  try {
    // Webhook events
    const weWhere = {
      provider: 'pagarme',
      ...(orderId ? { resourceOrderId: orderId } : {}),
      ...(chargeId ? { resourceChargeId: chargeId } : {}),
    };
    const webhookEvents = await prisma.webhookEvent.findMany({
      where: weWhere,
      orderBy: { receivedAt: 'desc' },
      take: limit,
      select: {
        provider: true,
        hook_id: true,
        type: true,
        resource_order_id: true,
        resource_charge_id: true,
        status: true,
        received_at: true,
      },
    }).catch(async (e) => {
      // Fall back to raw if model mapping differs
      return prisma.$queryRawUnsafe(
        `SELECT provider, hook_id, type, resource_order_id, resource_charge_id, status, received_at
         FROM webhook_events
         WHERE provider = 'pagarme'
           ${orderId ? `AND resource_order_id = '${orderId.replace(/'/g, "''")}'` : ''}
           ${chargeId ? `AND resource_charge_id = '${chargeId.replace(/'/g, "''")}'` : ''}
         ORDER BY received_at DESC
         LIMIT ${limit}`
      );
    });

    console.log('\n[inspect] Recent webhook_events:');
    console.table(
      webhookEvents.map((w) => ({
        type: w.type,
        order: w.resource_order_id || null,
        charge: w.resource_charge_id || null,
        status: w.status || null,
        received_at: new Date(w.received_at).toISOString(),
      }))
    );

    // Payment transactions
    const ptWhere = {
      provider: 'pagarme',
      ...(orderId ? { providerOrderId: orderId } : {}),
      ...(chargeId ? { providerChargeId: chargeId } : {}),
    };

    const paymentTransactions = await prisma.paymentTransaction.findMany({
      where: ptWhere,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        providerOrderId: true,
        providerChargeId: true,
        status: true,
        paymentMethodType: true,
        installments: true,
        amountCents: true,
        currency: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    console.log('\n[inspect] Recent payment_transactions:');
    console.table(
      paymentTransactions.map((t) => ({
        id: t.id,
        order: t.providerOrderId || null,
        charge: t.providerChargeId || null,
        status: t.status,
        method: t.paymentMethodType || null,
        installments: t.installments || null,
        amount: typeof t.amountCents === 'number' ? (t.amountCents / 100).toFixed(2) : null,
        currency: t.currency,
        created_at: new Date(t.createdAt).toISOString(),
        updated_at: new Date(t.updatedAt).toISOString(),
      }))
    );
  } catch (e) {
    console.error('[inspect] Error:', e?.message || e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
