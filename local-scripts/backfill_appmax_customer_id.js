const { prisma } = require("../dist/lib/prisma.js");

/**
 * Backfill appmaxCustomerId into customer_subscriptions.metadata
 * for existing Appmax subscriptions that are missing this field.
 * 
 * Usage:
 *   node local-scripts/backfill_appmax_customer_id.js
 *   DRY=true node local-scripts/backfill_appmax_customer_id.js  (dry-run mode)
 */
async function main() {
  const dry = String(process.env.DRY || "").toLowerCase() === "true";
  
  console.log(`🔍 Searching for Appmax subscriptions without appmaxCustomerId in metadata...`);
  console.log(`Mode: ${dry ? "DRY RUN" : "LIVE"}\n`);

  // Buscar todas subscriptions APPMAX ativas ou past_due
  const subs = await prisma.customerSubscription.findMany({
    where: {
      provider: 'APPMAX',
      canceledAt: null,
      status: { in: ['ACTIVE', 'PAST_DUE', 'TRIAL', 'PENDING'] },
    },
    include: { customer: true },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`Found ${subs.length} active Appmax subscriptions\n`);

  let needsFix = 0;
  let fixed = 0;
  let skipped = 0;
  let errors = 0;

  for (const sub of subs) {
    const meta = (sub.metadata && typeof sub.metadata === 'object') ? sub.metadata : {};
    
    // Se já tem appmaxCustomerId, skip
    if (meta.appmaxCustomerId) {
      skipped++;
      continue;
    }

    needsFix++;
    console.log(`⚠️  Subscription ${sub.id} missing appmaxCustomerId`);
    console.log(`   Customer: ${sub.customerId} (${sub.customer?.email || 'no email'})`);
    console.log(`   Merchant: ${sub.merchantId}`);

    // Buscar customer_provider para pegar o providerCustomerId (Appmax customer_id)
    const cp = await prisma.customerProvider.findFirst({
      where: {
        customerId: sub.customerId,
        provider: 'APPMAX',
        accountId: sub.merchantId,
      },
      select: { providerCustomerId: true },
    });

    if (cp?.providerCustomerId) {
      console.log(`   Found Appmax customer_id: ${cp.providerCustomerId}`);
      
      if (!dry) {
        try {
          meta.appmaxCustomerId = cp.providerCustomerId;
          await prisma.customerSubscription.update({
            where: { id: sub.id },
            data: { metadata: meta },
          });
          console.log(`   ✅ Updated subscription metadata\n`);
          fixed++;
        } catch (e) {
          console.error(`   ❌ Failed to update: ${e instanceof Error ? e.message : e}\n`);
          errors++;
        }
      } else {
        console.log(`   [DRY RUN] Would update metadata with appmaxCustomerId: ${cp.providerCustomerId}\n`);
        fixed++;
      }
    } else {
      console.warn(`   ❌ No customer_provider found with Appmax customer_id`);
      console.warn(`   This subscription cannot be renewed until Appmax customer_id is linked\n`);
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
    console.log(`  node local-scripts/backfill_appmax_customer_id.js\n`);
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
