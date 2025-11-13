import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

function ok(data: any, init?: number) { return NextResponse.json(data, { status: init || 200 }) }
function bad(message: string, extra?: any) { return NextResponse.json({ error: message, ...(extra||{}) }, { status: 400 }) }
function fail(message: string, extra?: any) { return NextResponse.json({ error: message, ...(extra||{}) }, { status: 500 }) }

function genKrxCode() { return `krx_prod_${crypto.randomBytes(6).toString('hex')}` }
async function ensureKrxpayItem(_productId: string) { return genKrxCode() }

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const productId = String(body?.productId || '')
    if (!productId) return bad('productId is required')

    // Do not overwrite existing mapping
    const existing = await prisma.productIntegration.findUnique({
      where: { productId_provider: { productId, provider: 'KRXPAY' as any } },
      select: { externalProductId: true }
    })
    const externalProductId = existing?.externalProductId || await ensureKrxpayItem(productId)

    const up = await prisma.productIntegration.upsert({
      where: { productId_provider: { productId, provider: 'KRXPAY' as any } },
      update: { externalProductId },
      create: { productId, provider: 'KRXPAY' as any, externalProductId },
    })

    return ok({ ok: true, externalProductId: up.externalProductId })
  } catch (e: any) {
    return fail('Failed to ensure KRXPAY product', { message: e?.message || 'Unknown error' })
  }
}
