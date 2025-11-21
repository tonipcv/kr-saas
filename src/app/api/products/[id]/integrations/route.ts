import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PaymentProvider } from '@prisma/client'
import crypto from 'crypto'

function ok(data: any, init?: number) { return NextResponse.json(data, { status: init || 200 }) }

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const url = new URL(req.url)
    const providerRaw = String(url.searchParams.get('provider') || '').toUpperCase()
    if (!providerRaw || !(providerRaw in PaymentProvider)) return bad('Invalid provider')

    const product = await prisma.product.findUnique({ where: { id }, select: { id: true } })
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

    await prisma.productIntegration.delete({
      where: { productId_provider: { productId: id, provider: providerRaw as any } },
    }).catch(() => {})

    return ok({ ok: true })
  } catch (e: any) {
    return fail('Failed to delete product integration', { message: e?.message || 'Unknown error' })
  }
}
function bad(message: string, extra?: any) { return NextResponse.json({ error: message, ...(extra||{}) }, { status: 400 }) }
function fail(message: string, extra?: any) { return NextResponse.json({ error: message, ...(extra||{}) }, { status: 500 }) }

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const product = await prisma.product.findUnique({ where: { id }, select: { id: true, name: true } })
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

    const rows = await prisma.productIntegration.findMany({ where: { productId: id } })
    const map: Record<string, { externalProductId: string }> = {}
    for (const r of rows) {
      map[r.provider] = { externalProductId: r.externalProductId }
    }

    // connection hints (best-effort)
    const stripeConnected = !!process.env.STRIPE_SECRET_KEY
    const krxConnected = !!(process.env.PAGARME_API_KEY || process.env.KRXPAY_API_KEY)
    // Best-effort: expose Appmax status (env-only hint; actual merchant integration is clinic-scoped)
    const appmaxConnected = !!process.env.APPMAX_ACCESS_TOKEN

    return ok({
      ok: true,
      product: { id: product.id, name: product.name },
      integrations: map,
      status: {
        stripe: { connected: stripeConnected },
        krxpay: { connected: krxConnected },
        appmax: { connected: appmaxConnected },
      },
    })
  } catch (e: any) {
    return fail('Failed to load product integrations', { message: e?.message || 'Unknown error' })
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))

    const providerRaw = String(body?.provider || '').toUpperCase()
    if (!providerRaw || !(providerRaw in PaymentProvider)) return bad('Invalid provider', { received: body?.provider })
    let externalProductId = String(body?.externalProductId || '').trim()

    // Fast-track robustness for KRXPAY: allow auto-generate when missing
    if (providerRaw === 'KRXPAY' && !externalProductId) {
      const existing = await prisma.productIntegration.findUnique({
        where: { productId_provider: { productId: id, provider: 'KRXPAY' as any } },
        select: { externalProductId: true }
      }).catch(() => null as any)
      if (existing?.externalProductId) {
        externalProductId = existing.externalProductId
      } else {
        externalProductId = `krx_prod_${crypto.randomBytes(6).toString('hex')}`
      }
    }

    if (!externalProductId) return bad('externalProductId is required')

    const product = await prisma.product.findUnique({ where: { id }, select: { id: true } })
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

    const up = await prisma.productIntegration.upsert({
      where: { productId_provider: { productId: id, provider: providerRaw as any } },
      update: { externalProductId },
      create: { productId: id, provider: providerRaw as any, externalProductId },
    })

    return ok({ ok: true, integration: { provider: up.provider, externalProductId: up.externalProductId } })
  } catch (e: any) {
    return fail('Failed to save product integration', { message: e?.message || 'Unknown error' })
  }
}
