import { task } from "@trigger.dev/sdk/v3";
import { getPrisma } from "./prisma";
import { signPayload } from "@/lib/webhooks/signature";

/**
 * Trigger.dev task para entregar webhooks outbound
 * 
 * Substitui o worker manual (outbound-worker.ts) com:
 * - Retry automático nativo do Trigger.dev
 * - Dashboard com logs/métricas
 * - Escalabilidade automática
 * 
 * Mantém 100% compatível com:
 * - Tabelas existentes (outbound_webhook_deliveries, etc)
 * - Payload format (specVersion 1.0)
 * - Assinatura HMAC SHA-256
 * - Validações (HTTPS, tamanho)
 */
const deliverWebhook = task({
  id: "deliver-webhook",
  
  // Retry policy: replica o backoff manual original
  // [0s, 1min, 5min, 15min, 1h, 6h, 24h, 48h, 72h, 96h]
  retry: {
    maxAttempts: 10,
    factor: 1.8,
    minTimeoutInMs: 60000,      // 1 minuto
    maxTimeoutInMs: 86400000,   // 24 horas
    randomize: true,            // Jitter para evitar thundering herd
  },
  
  // Timeout por tentativa (15s como no worker manual)
  // Nota: Trigger.dev não tem timeout de execução, mas o fetch tem
  
  run: async (payload: { deliveryId: string }, { ctx }) => {
    const prisma = await getPrisma();
    const { deliveryId } = payload;
    const attemptNumber = ctx.attempt.number;

    console.log(`[Webhook Delivery] Processing ${deliveryId} (attempt ${attemptNumber}/10)`);
    console.log('[Webhook Delivery] Lookup delivery by id (type):', deliveryId, typeof deliveryId);

    // 1. Buscar delivery com endpoint e event
    const delivery = await prisma.outboundWebhookDelivery.findFirst({
      where: { id: deliveryId },
      include: {
        endpoint: true,
        event: true,
      },
    });

    if (!delivery) {
      console.error(`[Webhook Delivery] Delivery ${deliveryId} not found`);
      throw new Error(`Delivery ${deliveryId} not found`);
    }

    // Se já foi entregue, skip (idempotência)
    if (delivery.status === 'DELIVERED') {
      console.log(`[Webhook Delivery] ${deliveryId} already delivered, skipping`);
      return {
        status: 'already_delivered',
        deliveryId,
        attempt: attemptNumber,
      };
    }

    // 2. Validar HTTPS (segurança obrigatória)
    if (!delivery.endpoint.url.startsWith('https://')) {
      console.error(`[Webhook Delivery] ${deliveryId} endpoint must use HTTPS: ${delivery.endpoint.url}`);
      
      await prisma.outboundWebhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'FAILED',
          lastError: 'Endpoint URL must use HTTPS for security',
          attempts: (delivery.attempts || 0) + 1,
          nextAttemptAt: null,
        },
      });
      
      throw new Error('HTTPS required');
    }

    // 3. Montar payload (formato v1.0 - mantém compatibilidade)
    const webhookPayload = {
      specVersion: '1.0',
      id: delivery.event.id,
      type: delivery.event.type,
      createdAt: delivery.event.createdAt.toISOString(),
      attempt: attemptNumber,
      idempotencyKey: delivery.event.id,
      clinicId: delivery.event.clinicId,
      resource: delivery.event.resource,
      data: delivery.event.payload,
    };

    const body = JSON.stringify(webhookPayload);

    // 4. Validar tamanho do payload (max 1MB)
    const sizeBytes = Buffer.byteLength(body, 'utf8');
    const MAX_SIZE = 1024 * 1024; // 1MB

    if (sizeBytes > MAX_SIZE) {
      console.error(`[Webhook Delivery] ${deliveryId} payload too large: ${sizeBytes} bytes (max: ${MAX_SIZE})`);
      
      await prisma.outboundWebhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'FAILED',
          lastError: `Payload too large: ${sizeBytes} bytes (max: 1MB)`,
          attempts: (delivery.attempts || 0) + 1,
          nextAttemptAt: null,
        },
      });
      
      throw new Error('Payload too large');
    }

    // 5. Assinar payload com HMAC SHA-256
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signPayload(delivery.endpoint.secret, body, timestamp);

    // 6. Enviar webhook com timeout de 15s
    const startTime = Date.now();
    
    try {
      const response = await fetch(delivery.endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Id': delivery.event.id,
          'X-Webhook-Event': delivery.event.type,
          'X-Webhook-Signature': signature,
          'X-Webhook-Timestamp': timestamp.toString(),
          'X-Webhook-Spec-Version': '1.0',
          'User-Agent': 'KrxScale-Webhooks/1.0 (Trigger.dev)',
        },
        body,
        signal: AbortSignal.timeout(15000), // 15s timeout
      });

      const latency = Date.now() - startTime;
      const responseText = await response.text().catch(() => '');

      // 7. Processar resposta
      if (response.ok) {
        // ✅ Sucesso - marcar como DELIVERED
        await prisma.outboundWebhookDelivery.update({
          where: { id: deliveryId },
          data: {
            status: 'DELIVERED',
            deliveredAt: new Date(),
            attempts: (delivery.attempts || 0) + 1,
            lastCode: response.status,
            lastError: null,
            nextAttemptAt: null,
          },
        });

        console.log(`[Webhook Delivery] ✅ ${deliveryId} delivered successfully in ${latency}ms (HTTP ${response.status})`);

        return {
          status: 'delivered',
          deliveryId,
          statusCode: response.status,
          latency,
          attempt: attemptNumber,
        };
      } else {
        // ❌ Falha HTTP - Trigger.dev vai fazer retry automaticamente
        const error = `HTTP ${response.status}: ${responseText.slice(0, 500)}`;
        
        console.error(`[Webhook Delivery] ❌ ${deliveryId} failed: ${error}`);
        
        // Atualizar delivery com erro (mantém PENDING para retry)
        await prisma.outboundWebhookDelivery.update({
          where: { id: deliveryId },
          data: {
            status: 'PENDING',
            attempts: (delivery.attempts || 0) + 1,
            lastCode: response.status,
            lastError: error,
            // nextAttemptAt é gerenciado pelo Trigger.dev
          },
        });

        // Lançar erro para Trigger.dev fazer retry
        throw new Error(error);
      }
    } catch (err: any) {
      const latency = Date.now() - startTime;
      const errorMessage = err?.message || String(err);
      
      console.error(`[Webhook Delivery] ❌ ${deliveryId} exception after ${latency}ms:`, errorMessage);
      
      // Atualizar delivery com erro
      await prisma.outboundWebhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'PENDING',
          attempts: (delivery.attempts || 0) + 1,
          lastCode: null,
          lastError: errorMessage.slice(0, 1000), // Limitar tamanho
        },
      });

      // Se atingiu max attempts, marcar como FAILED permanente
      if (attemptNumber >= 10) {
        await prisma.outboundWebhookDelivery.update({
          where: { id: deliveryId },
          data: {
            status: 'FAILED',
            nextAttemptAt: null,
          },
        });
        
        console.error(`[Webhook Delivery] 💀 ${deliveryId} permanently failed after ${attemptNumber} attempts`);
      }

      // Re-lançar para Trigger.dev fazer retry
      throw err;
    }
  },
});
