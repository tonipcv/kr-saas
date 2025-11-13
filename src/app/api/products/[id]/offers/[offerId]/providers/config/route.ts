import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PaymentProvider } from '@prisma/client'

function isRecord(v: any): v is Record<string, any> {
  return v && typeof v === 'object' && !Array.isArray(v)
}

function deepMerge<T extends Record<string, any>>(target: T, src: Record<string, any>): T {
  const out: any = Array.isArray(target) ? [...target] : { ...target }
  for (const [k, v] of Object.entries(src)) {
    if (isRecord(v)) {
      out[k] = deepMerge(isRecord(out[k]) ? out[k] : {}, v)
    } else {
      out[k] = v
    }
  }
  return out
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string, offerId: string }> }) {
  try {
    const { offerId } = await params
    const offer = await prisma.offer.findUnique({ where: { id: offerId }, select: { id: true, providerConfig: true } })
    if (!offer) return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
    return NextResponse.json({ ok: true, config: offer.providerConfig || {} })
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed to load provider config', message: e?.message || 'Unknown error' }, { status: 500 })
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string, offerId: string }> }) {
  try {
    const { offerId } = await params
    const body = await req.json().catch(() => ({}))

    let patch: any = {}
    if (isRecord(body?.config)) {
      patch = body.config
    } else if (body?.provider) {
      const providerRaw = String(body.provider).toUpperCase()
      const allowed = Object.keys(PaymentProvider)
      if (!allowed.includes(providerRaw)) return NextResponse.json({ error: 'Invalid provider', details: { received: body.provider } }, { status: 400 })
      const currency = body.currency ? String(body.currency).toUpperCase() : undefined
      const country = body.country ? String(body.country).toUpperCase() : undefined
      const leaf: Record<string, any> = {}
      if (body.externalPriceId) leaf.externalPriceId = String(body.externalPriceId)
      if (body.externalProductId) leaf.externalProductId = String(body.externalProductId)
      if (body.externalItemId) leaf.externalItemId = String(body.externalItemId)
      if (currency) {
        if (country && /^[A-Z]{2}$/.test(country)) {
          // provider[country][currency] = leaf
          patch = { [providerRaw]: { [country]: { [currency]: leaf } } }
        } else {
          // provider[currency] = leaf (back-compat without country)
          patch = { [providerRaw]: { [currency]: leaf } }
        }
      } else {
        patch = { [providerRaw]: leaf }
      }
    } else {
      return NextResponse.json({ error: 'No config provided' }, { status: 400 })
    }

    const existing = await prisma.offer.findUnique({ where: { id: offerId }, select: { providerConfig: true } })
    if (!existing) return NextResponse.json({ error: 'Offer not found' }, { status: 404 })

    const currentCfg = (existing.providerConfig && isRecord(existing.providerConfig)) ? existing.providerConfig : {}
    const merged = deepMerge(currentCfg, patch)

    const updated = await prisma.offer.update({ where: { id: offerId }, data: { providerConfig: merged }, select: { id: true, providerConfig: true } })
    return NextResponse.json({ ok: true, config: updated.providerConfig || {} })
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed to update provider config', message: e?.message || 'Unknown error' }, { status: 500 })
  }
}
