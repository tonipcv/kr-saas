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
      where: { merchantId_provider: { merchantId: merchant.id, provider: 'STRIPE' as any } },
    })

    if (!integration) return NextResponse.json({ exists: true, connected: false })

    const creds = integration.credentials as any
    const prelimConnected = !!(integration.isActive && creds?.apiKey)
    const verified = prelimConnected && !!integration.lastUsedAt
    // New policy: only consider "connected" when verified
    const connected = verified

    // Mask sensitive credentials for prefill (show last 4 chars)
    const maskSecret = (s: string | null | undefined) => {
      if (!s || typeof s !== 'string') return null
      if (s.length <= 4) return '***'
      return '***' + s.slice(-4)
    }
    const apiKeyMasked = maskSecret(creds?.apiKey)
    const webhookSecretMasked = maskSecret(creds?.webhookSecret)

    return NextResponse.json({ 
      exists: true, 
      connected, 
      verified, 
      accountId: creds?.accountId || null, 
      apiKey: apiKeyMasked,
      webhookSecret: webhookSecretMasked,
      lastUsedAt: integration.lastUsedAt 
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'internal_error' }, { status: 500 })
  }
}
