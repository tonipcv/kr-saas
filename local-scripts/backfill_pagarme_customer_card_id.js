const { prisma } = require("../dist/lib/prisma.js");

/**
 * Backfill pagarmeCustomerId and pagarmeCardId into customer_subscriptions.metadata
 * for existing Pagar.me subscriptions that are missing these fields.
 * 
 * Usage:
 *   node local-scripts/backfill_pagarme_customer_card_id.js
 *   DRY=true node local-scripts/backfill_pagarme_customer_card_id.js  (dry-run mode)
 */
async function main() {
  const dry = String(process.env.DRY || "").toLowerCase() === "true";
  
  console.log(`🔍 Searching for Pagar.me subscriptions without pagarmeCustomerId/pagarmeCardId...`);
  console.log(`Mode: ${dry ? "DRY RUN" : "LIVE"}\n`);

  // Buscar todas subscriptions PAGARME/KRXPAY ativas ou past_due
  const subs = await prisma.customerSubscription.findMany({
    where: {
      provider: { in: ['PAGARME', 'KRXPAY'] },
      canceledAt: null,
      status: { in: ['ACTIVE', 'PAST_DUE', 'TRIAL', 'PENDING'] },
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`Found ${subs.length} active Pagar.me subscriptions\n`);

  let needsFix = 0;
  let fixed = 0;
  let skipped = 0;
  let errors = 0;

  for (const sub of subs) {
    const meta = (sub.metadata && typeof sub.metadata === 'object') ? sub.metadata : {};
    
    // Se já tem ambos, skip
    if (meta.pagarmeCustomerId && meta.pagarmeCardId) {
      skipped++;
      continue;
    }

    needsFix++;
    console.log(`⚠️  Subscription ${sub.id} missing pagarmeCustomerId or pagarmeCardId`);
    console.log(`   Has customerId: ${!!meta.pagarmeCustomerId}, Has cardId: ${!!meta.pagarmeCardId}`);

    // Buscar order_id do metadata
    const pagarmeOrderId = meta.pagarmeOrderId;
    if (!pagarmeOrderId) {
      console.warn(`   ❌ No pagarmeOrderId in metadata, cannot fetch order details\n`);
      errors++;
      continue;
    }

    console.log(`   Order ID: ${pagarmeOrderId}`);

    try {
      // 1) Tentar extrair do payment_transactions.raw_payload (evita depender do SDK)
      const txRows = await prisma.$queryRawUnsafe(
        `SELECT raw_payload FROM payment_transactions 
          WHERE provider IN ('pagarme','krxpay') AND provider_order_id = $1 
          ORDER BY created_at DESC LIMIT 1`,
        String(pagarmeOrderId)
      );
      const tx = Array.isArray(txRows) && txRows[0] ? txRows[0] : null;
      const raw = tx?.raw_payload || null;

      let customerId = null;
      let cardId = null;
      if (raw && typeof raw === 'object') {
        try { customerId = raw?.customer?.id || null; } catch {}
        try {
          const ch = Array.isArray(raw?.charges) ? raw.charges[0] : null;
          const ltx = ch?.last_transaction || null;
          cardId = ltx?.card?.id || null;
          if (!cardId) {
            const pay = Array.isArray(raw?.payments) ? raw.payments[0] : null;
            const ptx = pay?.last_transaction || pay?.transaction || null;
            cardId = ptx?.card?.id || null;
          }
        } catch {}
      }

      console.log(`   Found (from DB raw_payload) customerId: ${customerId || 'N/A'}, cardId: ${cardId || 'N/A'}`);

      if (customerId || cardId) {
        if (!dry) {
          if (customerId) meta.pagarmeCustomerId = customerId;
          if (cardId) meta.pagarmeCardId = cardId;

          await prisma.customerSubscription.update({
            where: { id: sub.id },
            data: { metadata: meta },
          });
          console.log(`   ✅ Updated subscription metadata\n`);
          fixed++;
        } else {
          console.log(`   [DRY RUN] Would update metadata\n`);
          fixed++;
        }
      } else {
        // 2) Fallback: try vault (customer_payment_methods) and customer_providers
        try {
          // Prefer default active PAGARME method with matching accountId
          const pm = await prisma.customerPaymentMethod.findFirst({
            where: {
              customerId: sub.customerId,
              provider: 'PAGARME',
              status: 'ACTIVE',
              accountId: sub.merchantId,
            },
            orderBy: { isDefault: 'desc' },
          });
          // If not found, try KRXPAY provider alias
          let pm2 = pm;
          if (!pm2) {
            pm2 = await prisma.customerPaymentMethod.findFirst({
              where: {
                customerId: sub.customerId,
                provider: 'KRXPAY',
                status: 'ACTIVE',
                accountId: sub.merchantId,
              },
              orderBy: { isDefault: 'desc' },
            });
          }

          // Customer provider mapping for pagarmeCustomerId
          const cp = await prisma.customerProvider.findFirst({
            where: { customerId: sub.customerId, provider: 'PAGARME', accountId: sub.merchantId },
            select: { providerCustomerId: true },
          });

          const vaultCardId = pm2?.providerPaymentMethodId || null;
          const providerCustomerId = cp?.providerCustomerId || null;

          console.log(`   Fallback (vault): cardId=${vaultCardId || 'N/A'}, providerCustomerId=${providerCustomerId || 'N/A'}`);

          if (vaultCardId || providerCustomerId) {
            if (!dry) {
              if (providerCustomerId) meta.pagarmeCustomerId = providerCustomerId;
              if (vaultCardId) meta.pagarmeCardId = vaultCardId;
              await prisma.customerSubscription.update({ where: { id: sub.id }, data: { metadata: meta } });
              console.log(`   ✅ Updated subscription metadata using vault fallback\n`);
              fixed++;
            } else {
              console.log(`   [DRY RUN] Would update metadata using vault fallback\n`);
              fixed++;
            }
          } else {
            console.warn(`   ❌ Could not extract ids from DB or vault. Consider adding API call fallback.\n`);
            errors++;
          }
        } catch (e2) {
          console.error(`   ❌ Vault fallback failed: ${e2 instanceof Error ? e2.message : e2}\n`);
          errors++;
        }
      }
    } catch (e) {
      console.error(`   ❌ Failed to read payment_transactions: ${e instanceof Error ? e.message : e}\n`);
      errors++;
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Summary:`);
  console.log(`  Total subscriptions: ${subs.length}`);
  console.log(`  Already OK: ${skipped}`);
  console.log(`  Needed fix: ${needsFix}`);
  console.log(`  ${dry ? 'Would fix' : 'Fixed'}: ${fixed}`);
  console.log(`  Errors: ${errors}`);
  console.log(`${'='.repeat(60)}\n`);

  if (dry && needsFix > 0) {
    console.log(`Run without DRY=true to apply changes:\n`);
    console.log(`  node local-scripts/backfill_pagarme_customer_card_id.js\n`);
  }
}

main()
  .catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
  })
  .finally(async () => {
    try { await prisma.$disconnect(); } catch {}
  });
