import {
  prisma
} from "../../chunk-Z52AI326.mjs";
import {
  schedules_exports,
  tasks
} from "../../chunk-ZVCL2B46.mjs";
import "../../chunk-RA6RHLTU.mjs";
import {
  __name,
  init_esm
} from "../../chunk-NKKWNCEX.mjs";

// trigger/billing-renewal.ts
init_esm();
var dailyBillingRenewal = schedules_exports.task({
  id: "daily-billing-renewal",
  cron: {
    pattern: "0 9 * * *",
    // 09:00 todos os dias
    timezone: "America/Sao_Paulo"
  },
  run: /* @__PURE__ */ __name(async () => {
    const now = /* @__PURE__ */ new Date();
    const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    console.log("[SCHEDULER] Starting billing renewal", {
      timestamp: now.toISOString(),
      period: yyyymm
    });
    try {
      const due = await prisma.customerSubscription.findMany({
        where: {
          canceledAt: null,
          isNative: false,
          status: { in: ["ACTIVE", "PAST_DUE"] },
          currentPeriodEnd: { lte: now }
        },
        select: {
          id: true,
          provider: true,
          customerId: true,
          merchantId: true
        },
        take: 200,
        orderBy: { currentPeriodEnd: "asc" }
      });
      const pagarme = due.filter((s) => ["PAGARME", "KRXPAY"].includes(String(s.provider)));
      const appmax = due.filter((s) => s.provider === "APPMAX");
      const summary = {
        pagarme: { queued: 0, failed: 0 },
        appmax: { queued: 0, failed: 0 }
      };
      if (process.env.TRIGGER_ENABLE_PAGARME_PREPAID === "true") {
        for (const sub of pagarme) {
          try {
            await tasks.trigger("pagarme-prepaid-renewal", {
              subscriptionId: sub.id
            });
            summary.pagarme.queued++;
          } catch (e) {
            console.error("[SCHEDULER] Failed to trigger pagarme-prepaid-renewal", {
              subscriptionId: sub.id,
              error: e?.message
            });
            summary.pagarme.failed++;
          }
        }
      } else {
        console.log("[SCHEDULER] Skipped Pagar.me prepaid (feature flag disabled)");
      }
      if (process.env.TRIGGER_ENABLE_APPMAX === "true") {
        for (const sub of appmax) {
          try {
            await tasks.trigger("appmax-renewal", {
              subscriptionId: sub.id
            });
            summary.appmax.queued++;
          } catch (e) {
            console.error("[SCHEDULER] Failed to trigger appmax-renewal", {
              subscriptionId: sub.id,
              error: e?.message
            });
            summary.appmax.failed++;
          }
        }
      } else {
        console.log("[SCHEDULER] Skipped Appmax (feature flag disabled)");
      }
      console.log("[SCHEDULER] Summary", summary);
      return { period: yyyymm, ...summary };
    } catch (error) {
      console.error("[SCHEDULER] ❌ Error while scheduling renewals", error);
      throw error;
    }
  }, "run")
});
export {
  dailyBillingRenewal
};
//# sourceMappingURL=billing-renewal.mjs.map
