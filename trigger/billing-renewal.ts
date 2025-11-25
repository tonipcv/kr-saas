import { schedules, tasks } from "@trigger.dev/sdk/v3";
import { prisma } from "@/lib/prisma";

export const dailyBillingRenewal = schedules.task({
  id: "daily-billing-renewal",
  cron: {
    pattern: "0 9 * * *", // 09:00 todos os dias
    timezone: "America/Sao_Paulo",
  },
  run: async () => {
    const now = new Date();
    const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;

    console.log("[SCHEDULER] Starting billing renewal", {
      timestamp: now.toISOString(),
      period: yyyymm,
    });

    try {
      // Buscar assinaturas DUE (não-nativas, gerenciadas por nós)
      const due = await prisma.customerSubscription.findMany({
        where: {
          canceledAt: null,
          isNative: false,
          status: { in: ["ACTIVE", "PAST_DUE"] as any },
          currentPeriodEnd: { lte: now },
        },
        select: {
          id: true,
          provider: true,
          customerId: true,
          merchantId: true,
        },
        take: 200,
        orderBy: { currentPeriodEnd: "asc" },
      });

      // Include KRXPAY as alias for Pagar.me prepaid subscriptions
      const pagarme = due.filter((s) => ["PAGARME", "KRXPAY"].includes(String(s.provider)) as any);
      const appmax = due.filter((s) => s.provider === ("APPMAX" as any));

      const summary = {
        pagarme: { queued: 0, failed: 0 },
        appmax: { queued: 0, failed: 0 },
      };

      // Disparar Pagar.me Prepaid
      if (process.env.TRIGGER_ENABLE_PAGARME_PREPAID === "true") {
        for (const sub of pagarme) {
          try {
            await tasks.trigger("pagarme-prepaid-renewal", {
              subscriptionId: sub.id,
            });
            summary.pagarme.queued++;
          } catch (e) {
            console.error("[SCHEDULER] Failed to trigger pagarme-prepaid-renewal", {
              subscriptionId: sub.id,
              error: (e as any)?.message,
            });
            summary.pagarme.failed++;
          }
        }
      } else {
        console.log("[SCHEDULER] Skipped Pagar.me prepaid (feature flag disabled)");
      }

      // Disparar Appmax
      if (process.env.TRIGGER_ENABLE_APPMAX === "true") {
        for (const sub of appmax) {
          try {
            await tasks.trigger("appmax-renewal", {
              subscriptionId: sub.id,
            });
            summary.appmax.queued++;
          } catch (e) {
            console.error("[SCHEDULER] Failed to trigger appmax-renewal", {
              subscriptionId: sub.id,
              error: (e as any)?.message,
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
  },
});
