import { prisma } from '@/lib/prisma'
import { buildTransactionPayload } from './payload'
import { tasks } from '@trigger.dev/sdk'
import type { deliverWebhook } from '../../../trigger/deliver-webhook'

export type EmitParams = {
  clinicId: string
  type: string
  resource: string
  resourceId: string
  payload: any
}

export async function emitOutboundEvent(params: EmitParams) {
  const event = await prisma.outboundWebhookEvent.create({
    data: {
      clinicId: params.clinicId,
      type: params.type,
      resource: params.resource,
      resourceId: params.resourceId,
      payload: params.payload,
    },
  })

  const endpoints = await prisma.webhookEndpoint.findMany({
    where: {
      clinicId: params.clinicId,
      enabled: true,
      events: { has: params.type },
    },
  })

  if (endpoints.length === 0) return { event, deliveries: [] as any[] }

  const deliveries = [] as any[]
  for (const ep of endpoints) {
    // Apply product filter when categoryFilter is 'products'
    if (ep.categoryFilter === 'products' && Array.isArray(ep.productFilters) && ep.productFilters.length > 0) {
      const productId = params.payload?.transaction?.productId
      if (!productId || !ep.productFilters.includes(productId)) {
        try {
          console.log('[webhooks] skipping delivery due to product filter', {
            endpointId: ep.id,
            endpointName: ep.name,
            productId,
            allowedProducts: ep.productFilters
          })
        } catch {}
        continue // Skip this endpoint
      }
    }

    const del = await prisma.outboundWebhookDelivery.create({
      data: {
        endpointId: ep.id,
        eventId: event.id,
        status: 'PENDING',
        nextAttemptAt: new Date(),
      },
    })
    deliveries.push(del)

    // ✅ TRIGGER.DEV: Disparar job de delivery (substitui worker manual)
    try {
      await tasks.trigger<typeof deliverWebhook>(
        'deliver-webhook',
        { deliveryId: del.id },
        {
          idempotencyKey: del.id, // Garante única execução
          queue: 'webhooks', // Queue name (concurrency configurado no trigger.config.ts)
        }
      )
      console.log(`[webhooks] Triggered delivery job for ${del.id}`)
    } catch (error) {
      console.error(`[webhooks] Failed to trigger delivery job for ${del.id}:`, error)
      // Não falhar a emissão se Trigger.dev estiver indisponível
      // O safety net pode re-disparar depois
    }
  }

  return { event, deliveries }
}

// Convenience helpers aligned with guide v2.0
export async function onPaymentTransactionCreated(transactionId: string) {
  try {
    const tx = await prisma.paymentTransaction.findUnique({
      where: { id: transactionId },
      select: { id: true, clinicId: true }
    })

    // ✅ VALIDAÇÃO: Verificar se transação existe e tem clinicId
    if (!tx) {
      console.warn(`[webhooks] Transaction ${transactionId} not found, skipping webhook`)
      return
    }

    if (!tx.clinicId) {
      console.warn(`[webhooks] Transaction ${transactionId} has no clinicId, skipping webhook`)
      return
    }

    const payload = await buildTransactionPayload(transactionId)
    await emitOutboundEvent({
      clinicId: tx.clinicId,
      type: 'payment.transaction.created',
      resource: 'payment_transaction',
      resourceId: transactionId,
      payload,
    })
  } catch (error) {
    console.error('[webhooks] Failed to emit created event:', error)
  }
}

export async function onPaymentTransactionStatusChanged(transactionId: string, newStatus: string) {
  try {
    const tx = await prisma.paymentTransaction.findUnique({
      where: { id: transactionId },
      select: { id: true, clinicId: true }
    })

    // ✅ VALIDAÇÃO: Verificar se transação existe e tem clinicId
    if (!tx) {
      console.warn(`[webhooks] Transaction ${transactionId} not found, skipping webhook`)
      return
    }

    if (!tx.clinicId) {
      console.warn(`[webhooks] Transaction ${transactionId} has no clinicId, skipping webhook`)
      return
    }

    const payload = await buildTransactionPayload(transactionId)
    
    // Map PaymentStatus enum to event suffix
    const statusMap: Record<string, string> = {
      'SUCCEEDED': 'succeeded',
      'FAILED': 'failed',
      'CANCELED': 'canceled',
      'CANCELLED': 'canceled',
      'REFUNDED': 'refunded',
      'PARTIALLY_REFUNDED': 'partially_refunded',
      'PROCESSING': 'processing',
      'PENDING': 'pending',
      'REQUIRES_ACTION': 'requires_action',
      'REFUNDING': 'refunding',
      'CHARGEBACK': 'chargeback',
      'DISPUTED': 'disputed',
      'EXPIRED': 'expired',
      'PAID': 'succeeded', // Legacy mapping
    }
    
    const suffix = statusMap[newStatus] || String(newStatus).toLowerCase().replace(/_/g, '_')
    const type = `payment.transaction.${suffix}`
    
    await emitOutboundEvent({
      clinicId: tx.clinicId,
      type,
      resource: 'payment_transaction',
      resourceId: transactionId,
      payload,
    })
  } catch (error) {
    console.error('[webhooks] Failed to emit status changed event:', error)
  }
}

export async function onPaymentTransactionPartiallyRefunded(transactionId: string) {
  const tx = await prisma.paymentTransaction.findUnique({ where: { id: transactionId } })
  if (!tx?.clinicId) return
  const payload = await buildTransactionPayload(transactionId)
  await emitOutboundEvent({
    clinicId: tx.clinicId,
    type: 'payment.transaction.partially_refunded',
    resource: 'payment_transaction',
    resourceId: transactionId,
    payload,
  })
}
