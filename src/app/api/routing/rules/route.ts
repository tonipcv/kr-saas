import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PaymentMethod, PaymentProvider } from '@prisma/client'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const merchantId = searchParams.get('merchantId') || ''
    const productId = searchParams.get('productId')
    const offerId = searchParams.get('offerId')
    if (!merchantId) return NextResponse.json({ error: 'merchantId is required' }, { status: 400 })
    const rules = await prisma.paymentRoutingRule.findMany({
      where: {
        merchantId,
        productId: productId || undefined,
        offerId: offerId || undefined,
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    })
    return NextResponse.json({ ok: true, count: rules.length, rules })
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed to list rules', message: e?.message || 'Unknown error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const merchantId: string = String(body.merchantId || '')
    if (!merchantId) return NextResponse.json({ error: 'merchantId is required' }, { status: 400 })
    // Normalize provider to Prisma enum
    const providerRaw = String(body.provider || '').toUpperCase()
    const allowedProviders: string[] = ['KRXPAY','STRIPE','ADYEN','PAYPAL','MERCADOPAGO','PAGARME','OPENFINANCE']
    if (!providerRaw || !allowedProviders.includes(providerRaw)) {
      return NextResponse.json({ error: 'Invalid provider', details: { received: body.provider } }, { status: 400 })
    }
    const provider = providerRaw as unknown as PaymentProvider
    const country: string | null = body.country ? String(body.country).toUpperCase() : null
    // Normalize method when present
    let method: PaymentMethod | null = null
    if (body.method) {
      const methodRaw = String(body.method).toUpperCase()
      const allowedMethods: string[] = ['PIX','CARD','BOLETO','PAYPAL','OPEN_FINANCE','OPEN_FINANCE_AUTOMATIC']
      if (!allowedMethods.includes(methodRaw)) {
        return NextResponse.json({ error: 'Invalid method', details: { received: body.method } }, { status: 400 })
      }
      method = methodRaw as unknown as PaymentMethod
    }
    const productId: string | null = body.productId || null
    const offerId: string | null = body.offerId || null
    const priority: number = typeof body.priority === 'number' ? body.priority : 100
    const isActive: boolean = typeof body.isActive === 'boolean' ? body.isActive : true

    // Avoid provider enum comparison at the DB level to prevent operator mismatch issues across environments.
    // Fetch by other keys and filter provider in JS.
    const maybeRules = await prisma.paymentRoutingRule.findMany({
      where: {
        merchantId,
        productId: productId || undefined,
        offerId: offerId || undefined,
        country: country || undefined,
        method: method || undefined,
      },
      take: 20,
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    })
    const exists = maybeRules.find(r => String(r.provider).toUpperCase() === providerRaw)
    if (exists) return NextResponse.json({ ok: true, rule: exists, created: false })

    const created = await prisma.paymentRoutingRule.create({
      data: {
        merchantId,
        productId: productId || undefined,
        offerId: offerId || undefined,
        country: country || undefined,
        method: method || undefined,
        provider,
        priority,
        isActive,
      },
    })
    return NextResponse.json({ ok: true, rule: created, created: true })
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed to create rule', message: e?.message || 'Unknown error' }, { status: 500 })
  }
}
