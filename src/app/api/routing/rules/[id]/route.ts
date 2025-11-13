import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PaymentMethod, PaymentProvider } from '@prisma/client'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const data: any = {}
    if (typeof body.merchantId === 'string') data.merchantId = body.merchantId
    if (typeof body.productId === 'string' || body.productId === null) data.productId = body.productId
    if (typeof body.offerId === 'string' || body.offerId === null) data.offerId = body.offerId
    if (typeof body.country === 'string' || body.country === null) data.country = body.country ? String(body.country).toUpperCase() : null
    // Normalize method
    if (typeof body.method === 'string' || body.method === null) {
      if (body.method === null) {
        data.method = null
      } else {
        const mRaw = String(body.method).toUpperCase()
        const allowedMethods: string[] = ['PIX','CARD','BOLETO','PAYPAL','OPEN_FINANCE','OPEN_FINANCE_AUTOMATIC']
        if (!allowedMethods.includes(mRaw)) return NextResponse.json({ error: 'Invalid method', details: { received: body.method } }, { status: 400 })
        data.method = mRaw as unknown as PaymentMethod
      }
    }
    // Normalize provider
    if (typeof body.provider === 'string') {
      const pRaw = String(body.provider).toUpperCase()
      const allowedProviders: string[] = ['KRXPAY','STRIPE','ADYEN','PAYPAL','MERCADOPAGO','PAGARME','OPENFINANCE']
      if (!allowedProviders.includes(pRaw)) return NextResponse.json({ error: 'Invalid provider', details: { received: body.provider } }, { status: 400 })
      data.provider = pRaw as unknown as PaymentProvider
    }
    if (typeof body.priority === 'number') data.priority = body.priority
    if (typeof body.isActive === 'boolean') data.isActive = body.isActive

    const updated = await prisma.paymentRoutingRule.update({ where: { id }, data })
    return NextResponse.json({ ok: true, rule: updated })
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed to update rule', message: e?.message || 'Unknown error' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const id = params.id
    await prisma.paymentRoutingRule.delete({ where: { id } })
    return NextResponse.json({ ok: true, id })
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed to delete rule', message: e?.message || 'Unknown error' }, { status: 500 })
  }
}
