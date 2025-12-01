import { prisma } from '@/lib/prisma'
import { buildTransactionPayload } from './payload'
// Trigger.dev calls removed in favor of native Vercel flow when enabled

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

    // Nativo (Vercel): disparo best-effort imediato; pump cobre o restante
    try {
      if (process.env.WEBHOOKS_USE_NATIVE === 'true' && process.env.APP_BASE_URL) {
        const base = process.env.APP_BASE_URL.replace(/\/$/, '')
        await fetch(`${base}/api/webhooks/deliver`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deliveryId: del.id }),
        })
        console.log(`[webhooks] Enqueued native delivery for ${del.id}`)
      }
    } catch (error) {
      console.error(`[webhooks] Failed to enqueue native delivery for ${del.id}:`, error)
      // Não falhar a emissão; o pump/cron fará retry
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
