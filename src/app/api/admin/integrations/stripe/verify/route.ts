import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import Stripe from 'stripe'

// Verify saved Stripe credentials for a merchant by performing a lightweight API call.
// Does not modify legacy flows.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const merchantId: string = body?.merchantId
    if (!merchantId) return NextResponse.json({ error: 'merchantId is required' }, { status: 400 })

    const integration = await prisma.merchantIntegration.findUnique({
      where: { merchantId_provider: { merchantId, provider: 'STRIPE' as any } },
    })
    if (!integration || !integration.isActive) {
      return NextResponse.json({ ok: false, verified: false, error: 'integration_not_found' }, { status: 404 })
    }

    const creds = integration.credentials as any
    const apiKey = creds?.apiKey
    const accountId = creds?.accountId || null
    if (!apiKey) return NextResponse.json({ ok: false, verified: false, error: 'missing_api_key' }, { status: 400 })

    const stripe = new Stripe(apiKey, { apiVersion: '2023-10-16' })

    try {
      if (accountId) {
        // Verify access to the specified Connect account
        const acct = await stripe.accounts.retrieve(accountId)
        if (!acct || acct.id !== accountId) throw new Error('account_mismatch')
      } else {
        // Generic verification when not using Connect: get balance
        await stripe.balance.retrieve()
      }
      // Mark verification timestamp
      await prisma.merchantIntegration.update({
        where: { merchantId_provider: { merchantId, provider: 'STRIPE' as any } },
        data: { lastUsedAt: new Date() }
      })
      return NextResponse.json({ ok: true, verified: true })
    } catch (e: any) {
      return NextResponse.json({ ok: false, verified: false, error: e?.message || 'verify_failed' }, { status: 400 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'internal_error' }, { status: 500 })
  }
}
