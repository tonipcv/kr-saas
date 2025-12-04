import { prisma } from '@/lib/prisma'
import { PaymentProvider, PaymentMethod } from '@prisma/client'
import type { BINInsights } from '@/lib/payments/krx-secure/types'

export type SelectProviderInput = {
  merchantId: string
  offerId?: string | null
  productId?: string | null
  country?: string | null
  method?: PaymentMethod | null
  // Optional enrichment from KRX Secure Inspect (Phase 1)
  insights?: BINInsights | null
}

async function isProviderActive(merchantId: string, provider: PaymentProvider): Promise<boolean> {
  // KRXPAY is internal - always available when merchantId exists
  if (provider === PaymentProvider.KRXPAY) {
    return !!merchantId
  }
  
  // External providers require merchant integration
  const integ = await prisma.merchantIntegration.findUnique({
    where: { merchantId_provider: { merchantId, provider } },
    select: { isActive: true },
  })
  return !!integ?.isActive
}

function getDefaultGlobalProvider(country?: string | null): PaymentProvider {
  const c = String(country || '').toUpperCase()
  // Neutral default: prefer STRIPE as a safe global default. Chips (routing rules) should decide per-country.
  return PaymentProvider.STRIPE
}

export async function selectProvider(params: SelectProviderInput): Promise<PaymentProvider> {
  const merchantId = params.merchantId
  const offerId = params.offerId || null
  const productId = params.productId || null
  const country = params.country || null
  const method = params.method || null

  try {
    console.log('[selectProvider] input', {
      merchantId,
      offerId,
      productId,
      country,
      method,
      hasInsights: !!params.insights,
      insightsMeta: params.insights
        ? {
            brand: params.insights.metadata?.brand,
            funding: params.insights.metadata?.funding,
            country: params.insights.metadata?.country,
          }
        : null,
    })
  } catch {}

  // Provider must come from routing rules or explicit preferences. No country bias here.

  if (offerId) {
    const offer = await prisma.offer.findUnique({ where: { id: offerId }, select: { preferredProvider: true, productId: true, currency: true } })
    if (offer?.preferredProvider) {
      if (await isProviderActive(merchantId, offer.preferredProvider)) return offer.preferredProvider
    }
    if (!productId && offer?.productId) {
      params.productId = offer.productId
    }
    // If there's no preferredProvider, try to infer from OfferPrice for the given country
    try {
      if (country) {
        const prices = await prisma.offerPrice.findMany({
          where: {
            offerId: offerId,
            country: country.toUpperCase(),
            active: true,
            // use offer currency when available to avoid cross-currency mismatches
            ...(offer?.currency ? { currency: offer.currency } : {}),
          },
          select: { provider: true },
          orderBy: { updatedAt: 'desc' },
        })
        if (prices && prices.length) {
          // Prefer KRXPAY if available, otherwise first provider with active integration
          const providersOrdered = [PaymentProvider.KRXPAY, ...prices.map(p => p.provider).filter(p => p !== PaymentProvider.KRXPAY)]
          for (const prov of providersOrdered) {
            // ensure this provider actually exists in the OfferPrice list
            if (!prices.some(p => p.provider === prov)) continue
            if (await isProviderActive(merchantId, prov)) {
              try { console.log('[selectProvider] inferred from OfferPrice', { provider: prov, country, offerId }); } catch {}
              return prov
            }
          }
        }
      }
    } catch {}
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
  
  try { console.log('[selectProvider] found rules', rules.map(r => ({ offerId: r.offerId, productId: r.productId, country: r.country, method: r.method, provider: r.provider, isActive: r.isActive, priority: r.priority }))); } catch {}

  const pick = (list: typeof rules) => {
    const c = country ? country.toUpperCase() : null
    const m = method || undefined
    let best: typeof rules[0] | undefined
    
    try { console.log('[selectProvider] picking from rules', { country: c, method: m, offerId, productId: productId || params.productId }); } catch {}
    
    // Priority 1: offer-specific rules
    for (const r of list) {
      if (offerId && r.offerId && r.offerId === offerId) {
        try { console.log('[selectProvider] checking offer rule', { ruleCountry: r.country, ruleMethod: r.method, ruleProvider: r.provider, countryMatch: !c || !r.country || r.country.toUpperCase() === c, methodMatch: !m || !r.method || r.method === m }); } catch {}
        if (c && r.country && r.country.toUpperCase() !== c) continue
        if (m && r.method && r.method !== m) continue
        best = r
        break
      }
    }
    
    // Priority 2: product-specific rules
    if (!best && (productId || params.productId)) {
      for (const r of list) {
        if ((productId || params.productId) && r.productId === (productId || params.productId)) {
          try { console.log('[selectProvider] checking product rule', { ruleCountry: r.country, ruleMethod: r.method, ruleProvider: r.provider }); } catch {}
          if (c && r.country && r.country.toUpperCase() !== c) continue
          if (m && r.method && r.method !== m) continue
          best = r
          break
        }
      }
    }
    
    // Priority 3: global rules
    if (!best) {
      for (const r of list) {
        if (!r.offerId && !r.productId) {
          try { console.log('[selectProvider] checking global rule', { ruleCountry: r.country, ruleMethod: r.method, ruleProvider: r.provider }); } catch {}
          if (c && r.country && r.country.toUpperCase() !== c) continue
          if (m && r.method && r.method !== m) continue
          best = r
          break
        }
      }
    }
    
    try { console.log('[selectProvider] picked rule', best ? { offerId: best.offerId, productId: best.productId, country: best.country, method: best.method, provider: best.provider } : null); } catch {}
    return best
  }

  const matched = pick(rules)
  try { console.log('[selectProvider] matched rule', matched ? { offerId: matched.offerId, productId: matched.productId, country: matched.country, method: matched.method, provider: matched.provider, isActive: matched.isActive } : null); } catch {}
  
  if (matched) {
    const providerActive = await isProviderActive(merchantId, matched.provider)
    try { console.log('[selectProvider] provider active check', { provider: matched.provider, active: providerActive }); } catch {}
    if (providerActive) return matched.provider
  }

  const def = getDefaultGlobalProvider(country)
  try { console.log('[selectProvider] fallback to default', { default: def }); } catch {}
  if (await isProviderActive(merchantId, def)) return def

  const any = await prisma.merchantIntegration.findFirst({ where: { merchantId, isActive: true }, orderBy: { connectedAt: 'asc' } })
  try { console.log('[selectProvider] fallback to any active', { provider: any?.provider }); } catch {}
  if (any?.provider) return any.provider

  try { console.log('[selectProvider] final fallback', { provider: def }); } catch {}
  return def
}
