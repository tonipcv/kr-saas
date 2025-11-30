import {
  prisma
} from "../../chunk-Z52AI326.mjs";
import {
  task
} from "../../chunk-ZVCL2B46.mjs";
import "../../chunk-RA6RHLTU.mjs";
import {
  __name,
  init_esm
} from "../../chunk-NKKWNCEX.mjs";

// trigger/deliver-webhook.ts
init_esm();

// src/lib/webhooks/signature.ts
init_esm();
import crypto from "crypto";
function signPayload(secret, body, timestamp) {
  const base = `t=${timestamp}.${body}`;
  const hmac = crypto.createHmac("sha256", secret).update(base).digest("hex");
  return `t=${timestamp},v1=${hmac}`;
}
__name(signPayload, "signPayload");

// trigger/deliver-webhook.ts
var deliverWebhook = task({
  id: "deliver-webhook",
  // Retry policy: replica o backoff manual original
  // [0s, 1min, 5min, 15min, 1h, 6h, 24h, 48h, 72h, 96h]
  retry: {
    maxAttempts: 10,
    factor: 1.8,
    minTimeoutInMs: 6e4,
    // 1 minuto
    maxTimeoutInMs: 864e5,
    // 24 horas
    randomize: true
    // Jitter para evitar thundering herd
  },
  // Timeout por tentativa (15s como no worker manual)
  // Nota: Trigger.dev não tem timeout de execução, mas o fetch tem
  run: /* @__PURE__ */ __name(async (payload, { ctx }) => {
    const { deliveryId } = payload;
    const attemptNumber = ctx.attempt.number;
    console.log(`[Webhook Delivery] Processing ${deliveryId} (attempt ${attemptNumber}/10)`);
    const delivery = await prisma.outboundWebhookDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        endpoint: true,
        event: true
      }
    });
    if (!delivery) {
      console.error(`[Webhook Delivery] Delivery ${deliveryId} not found`);
      throw new Error(`Delivery ${deliveryId} not found`);
    }
    if (delivery.status === "DELIVERED") {
      console.log(`[Webhook Delivery] ${deliveryId} already delivered, skipping`);
      return {
        status: "already_delivered",
        deliveryId,
        attempt: attemptNumber
      };
    }
    if (!delivery.endpoint.url.startsWith("https://")) {
      console.error(`[Webhook Delivery] ${deliveryId} endpoint must use HTTPS: ${delivery.endpoint.url}`);
      await prisma.outboundWebhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: "FAILED",
          lastError: "Endpoint URL must use HTTPS for security",
          attempts: (delivery.attempts || 0) + 1,
          nextAttemptAt: null
        }
      });
      throw new Error("HTTPS required");
    }
    const webhookPayload = {
      specVersion: "1.0",
      id: delivery.event.id,
      type: delivery.event.type,
      createdAt: delivery.event.createdAt.toISOString(),
      attempt: attemptNumber,
      idempotencyKey: delivery.event.id,
      clinicId: delivery.event.clinicId,
      resource: delivery.event.resource,
      data: delivery.event.payload
    };
    const body = JSON.stringify(webhookPayload);
    const sizeBytes = Buffer.byteLength(body, "utf8");
    const MAX_SIZE = 1024 * 1024;
    if (sizeBytes > MAX_SIZE) {
      console.error(`[Webhook Delivery] ${deliveryId} payload too large: ${sizeBytes} bytes (max: ${MAX_SIZE})`);
      await prisma.outboundWebhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: "FAILED",
          lastError: `Payload too large: ${sizeBytes} bytes (max: 1MB)`,
          attempts: (delivery.attempts || 0) + 1,
          nextAttemptAt: null
        }
      });
      throw new Error("Payload too large");
    }
    const timestamp = Math.floor(Date.now() / 1e3);
    const signature = signPayload(delivery.endpoint.secret, body, timestamp);
    const startTime = Date.now();
    try {
      const response = await fetch(delivery.endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Id": delivery.event.id,
          "X-Webhook-Event": delivery.event.type,
          "X-Webhook-Signature": signature,
          "X-Webhook-Timestamp": timestamp.toString(),
          "X-Webhook-Spec-Version": "1.0",
          "User-Agent": "KrxScale-Webhooks/1.0 (Trigger.dev)"
        },
        body,
        signal: AbortSignal.timeout(15e3)
        // 15s timeout
      });
      const latency = Date.now() - startTime;
      const responseText = await response.text().catch(() => "");
      if (response.ok) {
        await prisma.outboundWebhookDelivery.update({
          where: { id: deliveryId },
          data: {
            status: "DELIVERED",
            deliveredAt: /* @__PURE__ */ new Date(),
            attempts: (delivery.attempts || 0) + 1,
            lastCode: response.status,
            lastError: null,
            nextAttemptAt: null
          }
        });
        console.log(`[Webhook Delivery] ✅ ${deliveryId} delivered successfully in ${latency}ms (HTTP ${response.status})`);
        return {
          status: "delivered",
          deliveryId,
          statusCode: response.status,
          latency,
          attempt: attemptNumber
        };
      } else {
        const error = `HTTP ${response.status}: ${responseText.slice(0, 500)}`;
        console.error(`[Webhook Delivery] ❌ ${deliveryId} failed: ${error}`);
        await prisma.outboundWebhookDelivery.update({
          where: { id: deliveryId },
          data: {
            status: "PENDING",
            attempts: (delivery.attempts || 0) + 1,
            lastCode: response.status,
            lastError: error
            // nextAttemptAt é gerenciado pelo Trigger.dev
          }
        });
        throw new Error(error);
      }
    } catch (err) {
      const latency = Date.now() - startTime;
      const errorMessage = err?.message || String(err);
      console.error(`[Webhook Delivery] ❌ ${deliveryId} exception after ${latency}ms:`, errorMessage);
      await prisma.outboundWebhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: "PENDING",
          attempts: (delivery.attempts || 0) + 1,
          lastCode: null,
          lastError: errorMessage.slice(0, 1e3)
          // Limitar tamanho
        }
      });
      if (attemptNumber >= 10) {
        await prisma.outboundWebhookDelivery.update({
          where: { id: deliveryId },
          data: {
            status: "FAILED",
            nextAttemptAt: null
          }
        });
        console.error(`[Webhook Delivery] 💀 ${deliveryId} permanently failed after ${attemptNumber} attempts`);
      }
      throw err;
    }
  }, "run")
});
export {
  deliverWebhook
};
//# sourceMappingURL=deliver-webhook.mjs.map
