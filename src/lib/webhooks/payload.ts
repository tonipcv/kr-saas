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
    include: { checkoutSession: true },
  })
  if (!tx) throw new Error(`Transaction ${transactionId} not found`)

  const product = tx.productId
    ? await prisma.product.findUnique({ where: { id: tx.productId } }).catch(() => null)
    : null

  // Offer is not directly linked on PaymentTransaction; best-effort by productId and active offer
  const offer = tx.productId
    ? await prisma.offer.findFirst({
        where: { productId: tx.productId, active: true },
        orderBy: { createdAt: 'desc' },
      }).catch(() => null)
    : null

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
    offer: offer
      ? {
          id: offer.id,
          priceCents: offer.priceCents,
          currency: offer.currency,
          preferredProvider: (offer.preferredProvider as any) ?? null,
        }
      : undefined,
  }
}
