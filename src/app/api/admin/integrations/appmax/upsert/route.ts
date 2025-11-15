import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { PaymentProvider } from '@prisma/client'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const merchantId: string = body?.merchantId
    const credentials = body?.credentials || {}
    const config = body?.config || null

    if (!merchantId) return NextResponse.json({ error: 'merchantId is required' }, { status: 400 })
    if (!credentials?.apiKey) return NextResponse.json({ error: 'credentials.apiKey is required' }, { status: 400 })

    const provider: PaymentProvider = 'APPMAX' as any

    const result = await prisma.merchantIntegration.upsert({
      where: { merchantId_provider: { merchantId, provider } },
      create: {
        merchantId,
        provider,
        credentials,
        config: config || undefined,
        isActive: true,
      },
      update: {
        credentials,
        config: config || undefined,
        isActive: true,
        lastUsedAt: null,
        lastError: null,
        lastErrorAt: null,
      }
    })

    return NextResponse.json({ ok: true, id: result.id })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'internal_error' }, { status: 500 })
  }
}
