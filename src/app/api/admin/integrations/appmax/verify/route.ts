import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { AppmaxClient } from '@/lib/appmax'

async function resolveMerchantIdFromClinic(clinicId: string) {
  const merchant = await prisma.merchant.findUnique({ where: { clinicId } })
  return merchant?.id || null
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    let { merchantId, clinicId } = body || {}

    if (!merchantId && clinicId) {
      merchantId = await resolveMerchantIdFromClinic(String(clinicId))
    }
    if (!merchantId) return NextResponse.json({ ok: false, error: 'merchantId_or_clinicId_required' }, { status: 400 })

    // Load integration creds
    const integration = await prisma.merchantIntegration.findUnique({
      where: { merchantId_provider: { merchantId: String(merchantId), provider: 'APPMAX' as any } },
      select: { credentials: true, isActive: true },
    })
    if (!integration || !integration.isActive) return NextResponse.json({ ok: false, error: 'integration_not_active' }, { status: 400 })

    const creds = (integration.credentials || {}) as any
    const apiKey: string | undefined = creds?.apiKey
    const testMode: boolean = !!creds?.testMode
    if (!apiKey) return NextResponse.json({ ok: false, error: 'api_key_missing' }, { status: 400 })

    const client = new AppmaxClient(apiKey, { testMode })

    // Lightweight call: tokenize card (does not create order/payment)
    try {
      await client.tokenizeCard({
        card_number: '4111111111111111',
        cvv: '123',
        expiration_month: '12',
        expiration_year: '2029',
        holder_name: 'Test Appmax',
      })
    } catch (e: any) {
      const status = Number(e?.status) || 500
      // Persist lastError
      try {
        await prisma.merchantIntegration.update({
          where: { merchantId_provider: { merchantId: String(merchantId), provider: 'APPMAX' as any } },
          data: { lastError: String(e?.message || 'verify_failed'), lastErrorAt: new Date() },
        })
      } catch {}
      return NextResponse.json({ ok: false, verified: false, status, error: e?.message || 'verify_failed', response: e?.response || null }, { status: status >= 400 && status < 600 ? status : 400 })
    }

    // Success → mark verified timestamp
    try {
      await prisma.merchantIntegration.update({
        where: { merchantId_provider: { merchantId: String(merchantId), provider: 'APPMAX' as any } },
        data: { lastUsedAt: new Date(), lastError: null, lastErrorAt: null },
      })
    } catch {}

    return NextResponse.json({ ok: true, verified: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'internal_error' }, { status: 500 })
  }
}
