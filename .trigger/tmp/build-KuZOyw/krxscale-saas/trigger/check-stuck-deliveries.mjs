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

// trigger/check-stuck-deliveries.ts
init_esm();
var checkStuckDeliveries = schedules_exports.task({
  id: "check-stuck-deliveries",
  // A cada 5 minutos (apenas em produção)
  cron: {
    pattern: "*/5 * * * *",
    timezone: "America/Sao_Paulo",
    environments: ["PRODUCTION"]
    // Não rodar em dev/staging
  },
  run: /* @__PURE__ */ __name(async (payload) => {
    console.log("[Safety Net] Checking for stuck webhook deliveries", {
      timestamp: payload.timestamp
    });
    try {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1e3);
      const stuckDeliveries = await prisma.outboundWebhookDelivery.findMany({
        where: {
          status: "PENDING",
          createdAt: { lt: tenMinutesAgo },
          updatedAt: { lt: tenMinutesAgo },
          // Apenas deliveries que deveriam ter sido processadas
          nextAttemptAt: { lte: /* @__PURE__ */ new Date() }
        },
        select: {
          id: true,
          attempts: true,
          createdAt: true,
          updatedAt: true,
          endpointId: true
        },
        take: 50,
        // Limitar para não sobrecarregar
        orderBy: { createdAt: "asc" }
      });
      if (stuckDeliveries.length === 0) {
        console.log("[Safety Net] No stuck deliveries found ✅");
        return {
          checked: true,
          stuck: 0,
          retriggered: 0,
          failed: 0
        };
      }
      console.log(`[Safety Net] Found ${stuckDeliveries.length} stuck deliveries`);
      let retriggered = 0;
      let failed = 0;
      for (const delivery of stuckDeliveries) {
        try {
          if ((delivery.attempts || 0) >= 10) {
            console.log(`[Safety Net] Delivery ${delivery.id} exceeded max attempts, marking as FAILED`);
            await prisma.outboundWebhookDelivery.update({
              where: { id: delivery.id },
              data: {
                status: "FAILED",
                lastError: "Exceeded maximum retry attempts (safety net)",
                nextAttemptAt: null
              }
            });
            failed++;
            continue;
          }
          await tasks.trigger(
            "deliver-webhook",
            { deliveryId: delivery.id },
            {
              idempotencyKey: `${delivery.id}-retry-${Date.now()}`,
              // Novo idempotency key para forçar re-execução
              queue: "webhooks"
              // Queue name
            }
          );
          console.log(`[Safety Net] Re-triggered delivery ${delivery.id} (attempt ${delivery.attempts || 0})`);
          retriggered++;
        } catch (error) {
          console.error(`[Safety Net] Failed to re-trigger delivery ${delivery.id}:`, error);
          failed++;
        }
      }
      console.log(`[Safety Net] Summary: ${retriggered} retriggered, ${failed} failed`);
      return {
        checked: true,
        stuck: stuckDeliveries.length,
        retriggered,
        failed
      };
    } catch (error) {
      console.error("[Safety Net] Error checking stuck deliveries:", error);
      throw error;
    }
  }, "run")
});
export {
  checkStuckDeliveries
};
//# sourceMappingURL=check-stuck-deliveries.mjs.map
