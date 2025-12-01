import { schedules } from "@trigger.dev/sdk/v3";
import { getPrisma } from "./prisma";

export const billingScheduler = schedules.task({
  id: "billing-scheduler-dry-run",
  cron: "0 * * * *",
  run: async (payload) => {
    const prisma = await getPrisma();
    const now = new Date();
    console.log("🔍 Billing Scheduler - DRY RUN MODE", { now: now.toISOString() });

    try {
      // Stripe (native-managed) - observe only
      const stripeTotal = await prisma.customerSubscription.count({ where: { provider: "STRIPE" } });
      console.log(`✅ Stripe Native: ${stripeTotal} active (auto-renewal)`);

      // Pagar.me native (provider-managed) - observe only
      const pagarmeNative = await prisma.customerSubscription.count({
        where: { provider: "PAGARME", isNative: true },
      });
      console.log(`✅ Pagar.me Native: ${pagarmeNative} active (auto-renewal)`);

      // Pagar.me prepaid (manual renewal)
      const pagarmePrepaidDue = await prisma.customerSubscription.findMany({
        where: {
          provider: "PAGARME",
          isNative: false,
          canceledAt: null,
          currentPeriodEnd: { lte: now },
        },
        select: { id: true, currentPeriodEnd: true, priceCents: true },
        take: 100,
        orderBy: { currentPeriodEnd: "asc" },
      });
      console.log(`⚠️  Pagar.me Prepaid DUE: ${pagarmePrepaidDue.length}`);
      if (pagarmePrepaidDue.length > 0) {
        console.log("[DRY RUN] Pagar.me prepaid subscriptions that would be renewed:");
        pagarmePrepaidDue.forEach((sub, idx) => {
          const dueDate = sub.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : "N/A";
          console.log(`  ${idx + 1}. ${sub.id} - Due: ${dueDate} - Amount: ${sub.priceCents / 100}`);
        });
      }

      // Appmax (manual renewal)
      const appmaxDue = await prisma.customerSubscription.findMany({
        where: {
          provider: "APPMAX",
          canceledAt: null,
          currentPeriodEnd: { lte: now },
        },
        select: { id: true, currentPeriodEnd: true, priceCents: true },
        take: 100,
        orderBy: { currentPeriodEnd: "asc" },
      });
      console.log(`⚠️  Appmax DUE: ${appmaxDue.length}`);
      if (appmaxDue.length > 0) {
        console.log("[DRY RUN] Appmax subscriptions that would be renewed:");
        appmaxDue.forEach((sub, idx) => {
          const dueDate = sub.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : "N/A";
          console.log(`  ${idx + 1}. ${sub.id} - Due: ${dueDate} - Amount: ${sub.priceCents / 100}`);
        });
      }

      console.log("✅ Scheduler completed successfully");

      return {
        mode: "DRY_RUN",
        timestamp: now.toISOString(),
        summary: {
          stripeNative: { count: stripeTotal, action: "observe" },
          pagarmeNative: { count: pagarmeNative, action: "observe" },
          pagarmePrepaidDue: { count: pagarmePrepaidDue.length, action: "would_renew" },
          appmaxDue: { count: appmaxDue.length, action: "would_renew" },
        },
      };
    } catch (error) {
      console.error("❌ Scheduler error:", error);
      throw error;
    }
  },
});
