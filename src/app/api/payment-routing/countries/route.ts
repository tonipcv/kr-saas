import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const offerId = searchParams.get('offerId')
    const productId = searchParams.get('productId')

    if (!offerId && !productId) {
      return NextResponse.json({ error: 'offerId or productId required' }, { status: 400 })
    }

    // 1 — Routing rules (active)
    const routingCountries = await prisma.paymentRoutingRule.findMany({
      where: {
        ...(offerId ? { offerId: String(offerId) } : {}),
        ...(productId ? { productId: String(productId) } : {}),
        isActive: true,
      },
      select: { country: true },
    })

    // 2 — OfferPrice (active) — use raw to avoid client-model mismatch
    const priceCountriesRaw = await prisma.$queryRawUnsafe<{
      country: string | null
    }[]>(
      `SELECT DISTINCT country FROM offer_prices WHERE active = true ${offerId ? 'AND offer_id = $1' : ''}`,
      ...(offerId ? [String(offerId)] as any : [])
    )
    const priceCountries = (priceCountriesRaw || []).map(r => ({ country: r.country || '' }))

    const countries = Array.from(
      new Set([
        ...routingCountries.map(r => (r.country || '').toUpperCase()).filter(Boolean),
        ...priceCountries.map(p => (p.country || '').toUpperCase()).filter(Boolean),
      ])
    )

    return NextResponse.json({ countries })
  } catch (err) {
    console.error('COUNTRIES ERROR', err)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
