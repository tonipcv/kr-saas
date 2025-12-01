import { prisma } from '@/lib/prisma'

export type TransactionSnapshot = {
  transaction: {
    id: string
    provider: string
    providerOrderId: string | null
    providerChargeId: string | null
    clinicId: string | null
    merchantId: string | null
    productId: string | null
    amountCents: number
    currency: string
    installments: number | null
    paymentMethodType: string | null
    status: string
    status_v2: string | null
    paidAt: string | null
    refundedAt: string | null
    customerId: string | null
    customerProviderId: string | null
    customerPaymentMethodId: string | null
    customerSubscriptionId: string | null
    billingPeriodStart: string | null
    billingPeriodEnd: string | null
    createdAt: string
    updatedAt: string
    routedProvider: string | null
  }
  checkout?: {
    id: string
    status: string
    paymentMethod: string | null
    country: string | null
    email: string | null
    phone: string | null
    document: string | null
    orderId: string | null
    selectedInstallments: number | null
  }
  product?: { id: string; name: string; type: string }
  offer?: { id: string; priceCents: number; currency: string; preferredProvider: string | null }
}

export async function buildTransactionPayload(transactionId: string): Promise<TransactionSnapshot> {
  const tx = await prisma.paymentTransaction.findUnique({
    where: { id: transactionId },
    include: {
      checkoutSession: {
        select: {
          id: true,
          status: true,
          paymentMethod: true,
          country: true,
          email: true,
          phone: true,
          document: true,
          orderId: true,
          selectedInstallments: true,
        }
      }
    },
  })
  if (!tx) throw new Error(`Transaction ${transactionId} not found`)

  const product = tx.productId
    ? await prisma.product.findUnique({ where: { id: tx.productId } }).catch(() => null)
    : null

  // Offer is not directly linked on PaymentTransaction; best-effort resolution
  // 1) Try active offer; 2) fallback to latest offer by product; 3) fallback to tx amount/currency
  let offer: any | null = null
  if (tx.productId) {
    try {
      offer = await prisma.offer.findFirst({
        where: { productId: tx.productId, active: true },
        orderBy: { createdAt: 'desc' },
      })
      if (!offer) {
        offer = await prisma.offer.findFirst({
          where: { productId: tx.productId },
          orderBy: { createdAt: 'desc' },
        })
      }
    } catch {}
  }

  return {
    transaction: {
      id: tx.id,
      provider: tx.provider,
      providerOrderId: tx.providerOrderId ?? null,
      providerChargeId: tx.providerChargeId ?? null,
      clinicId: tx.clinicId ?? null,
      merchantId: tx.merchantId ?? null,
      productId: tx.productId ?? null,
      amountCents: tx.amountCents,
      currency: tx.currency,
      installments: tx.installments ?? null,
      paymentMethodType: tx.paymentMethodType ?? null,
      status: tx.status,
      status_v2: (tx.status_v2 as any) ?? null,
      paidAt: tx.paidAt ? tx.paidAt.toISOString() : null,
      refundedAt: tx.refundedAt ? tx.refundedAt.toISOString() : null,
      customerId: tx.customerId ?? null,
      customerProviderId: tx.customerProviderId ?? null,
      customerPaymentMethodId: tx.customerPaymentMethodId ?? null,
      customerSubscriptionId: tx.customerSubscriptionId ?? null,
      billingPeriodStart: tx.billingPeriodStart ? tx.billingPeriodStart.toISOString() : null,
      billingPeriodEnd: tx.billingPeriodEnd ? tx.billingPeriodEnd.toISOString() : null,
      createdAt: tx.createdAt.toISOString(),
      updatedAt: tx.updatedAt.toISOString(),
      routedProvider: tx.routedProvider ?? null,
    },
    checkout: tx.checkoutSession
      ? {
          id: tx.checkoutSession.id,
          status: tx.checkoutSession.status,
          paymentMethod: tx.checkoutSession.paymentMethod ?? null,
          country: tx.checkoutSession.country ?? null,
          email: tx.checkoutSession.email ?? null,
          phone: tx.checkoutSession.phone ?? null,
          document: tx.checkoutSession.document ?? null,
          orderId: tx.checkoutSession.orderId ?? null,
          selectedInstallments: tx.checkoutSession.selectedInstallments ?? null,
        }
      : undefined,
    product: product
      ? { id: product.id, name: product.name, type: product.type }
      : undefined,
    offer: (() => {
      if (offer) {
        return {
          id: offer.id,
          priceCents: Number(offer.priceCents ?? 0) > 0 ? Number(offer.priceCents) : tx.amountCents,
          currency: offer.currency || tx.currency,
          preferredProvider: (offer.preferredProvider as any) ?? (tx.routedProvider as any) ?? (tx.provider as any) ?? null,
        }
      }
      // No offer found: provide a sensible fallback to avoid zeros/empties in downstream systems
      return {
        id: tx.productId ? `${tx.productId}:fallback` : `${tx.id}:fallback`,
        priceCents: tx.amountCents,
        currency: tx.currency,
        preferredProvider: (tx.routedProvider as any) ?? (tx.provider as any) ?? null,
      }
    })(),
  }
}
