import { prisma } from '@/lib/prisma'
import { PaymentProvider, PaymentMethod } from '@prisma/client'

export type SelectProviderInput = {
  merchantId: string
  offerId?: string | null
  productId?: string | null
  country?: string | null
  method?: PaymentMethod | null
}

async function isProviderActive(merchantId: string, provider: PaymentProvider): Promise<boolean> {
  const integ = await prisma.merchantIntegration.findUnique({
    where: { merchantId_provider: { merchantId, provider } },
    select: { isActive: true },
  })
  return !!integ?.isActive
}

function getDefaultGlobalProvider(country?: string | null): PaymentProvider {
  const c = String(country || '').toUpperCase()
  if (c === 'BR') return PaymentProvider.KRXPAY
  return PaymentProvider.STRIPE
}

export async function selectProvider(params: SelectProviderInput): Promise<PaymentProvider> {
  const merchantId = params.merchantId
  const offerId = params.offerId || null
  const productId = params.productId || null
  const country = params.country || null
  const method = params.method || null

  if (offerId) {
    const offer = await prisma.offer.findUnique({ where: { id: offerId }, select: { preferredProvider: true, productId: true } })
    if (offer?.preferredProvider) {
      if (await isProviderActive(merchantId, offer.preferredProvider)) return offer.preferredProvider
    }
    if (!productId && offer?.productId) {
      params.productId = offer.productId
    }
  }

  const rules = await prisma.paymentRoutingRule.findMany({
    where: {
      merchantId,
      isActive: true,
      OR: [
        { offerId: offerId ?? undefined },
        { productId: (productId || params.productId) ?? undefined },
        { productId: null, offerId: null },
      ],
    },
    orderBy: [{ priority: 'asc' }],
  })

  const pick = (list: typeof rules) => {
    const c = country ? country.toUpperCase() : null
    const m = method || undefined
    let best: typeof rules[0] | undefined
    for (const r of list) {
      if (offerId && r.offerId && r.offerId === offerId) {
        if (c && r.country && r.country.toUpperCase() !== c) continue
        if (m && r.method && r.method !== m) continue
        best = r
        break
      }
    }
    if (!best && (productId || params.productId)) {
      for (const r of list) {
        if ((productId || params.productId) && r.productId === (productId || params.productId)) {
          if (c && r.country && r.country.toUpperCase() !== c) continue
          if (m && r.method && r.method !== m) continue
          best = r
          break
        }
      }
    }
    if (!best) {
      for (const r of list) {
        if (!r.offerId && !r.productId) {
          if (c && r.country && r.country.toUpperCase() !== c) continue
          if (m && r.method && r.method !== m) continue
          best = r
          break
        }
      }
    }
    return best
  }

  const matched = pick(rules)
  if (matched && (await isProviderActive(merchantId, matched.provider))) return matched.provider

  const def = getDefaultGlobalProvider(country)
  if (await isProviderActive(merchantId, def)) return def

  const any = await prisma.merchantIntegration.findFirst({ where: { merchantId, isActive: true }, orderBy: { connectedAt: 'asc' } })
  if (any?.provider) return any.provider

  return def
}
