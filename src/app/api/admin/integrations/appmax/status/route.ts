import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const clinicId = searchParams.get('clinicId')
    if (!clinicId) return NextResponse.json({ error: 'clinicId is required' }, { status: 400 })

    const merchant = await prisma.merchant.findUnique({ where: { clinicId } })
    if (!merchant) return NextResponse.json({ exists: false, connected: false })

    const integration = await prisma.merchantIntegration.findUnique({
      where: { merchantId_provider: { merchantId: merchant.id, provider: 'APPMAX' as any } },
    })

    if (!integration) return NextResponse.json({ exists: true, connected: false })

    const creds = (integration.credentials || {}) as any
    const prelimConnected = !!(integration.isActive && creds?.apiKey)
    const verified = !!integration.lastUsedAt // we may later set this when a call succeeds
    const connected = prelimConnected && (verified || true) // consider connected when prelim ok for now

    return NextResponse.json({ exists: true, connected, verified, testMode: !!creds?.testMode, lastUsedAt: integration.lastUsedAt })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'internal_error' }, { status: 500 })
  }
}
