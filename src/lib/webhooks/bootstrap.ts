import { startOutboundWebhookWorker } from '@/lib/webhooks/outbound-worker'

let started = false

/**
 * Bootstrap do worker manual de webhooks
 * 
 * ⚠️ DEPRECADO: Migrado para Trigger.dev
 * 
 * O worker manual foi substituído por jobs do Trigger.dev:
 * - trigger/deliver-webhook.ts (delivery principal)
 * - trigger/check-stuck-deliveries.ts (safety net)
 * 
 * Mantido apenas para rollback de emergência.
 * Para ativar: OUTBOUND_WEBHOOKS_ENABLED=true
 * 
 * @deprecated Use Trigger.dev jobs instead
 */
export function bootstrapOutboundWebhooksWorker() {
  if (started) return
  
  // ⚠️ Desabilitado por padrão - migrado para Trigger.dev
  // Para rollback: OUTBOUND_WEBHOOKS_ENABLED=true
  if (process.env.OUTBOUND_WEBHOOKS_ENABLED === 'true') {
    startOutboundWebhookWorker()
    started = true
    console.log('[Outbound Webhooks] ⚠️ Manual worker started (Trigger.dev disabled)')
  } else {
    console.log('[Outbound Webhooks] ✅ Using Trigger.dev (manual worker disabled)')
  }
}
