import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { getKrxpayCredentialsByClinicId } from '@/lib/payments/krxpay-from-integration'

function safeJsonParse<T = any>(txt: string): T | null {
  try { return JSON.parse(txt) as T } catch { return null }
}

function toInternalSubStatus(s: string | null | undefined): string {
  const v = (s || '').toString().toLowerCase()
  if (v.includes('trial')) return 'TRIAL'
  if (v.includes('past_due') || v.includes('pastdue') || v.includes('overdue')) return 'PAST_DUE'
  if (v.includes('canceled') || v.includes('cancel')) return 'CANCELED'
  if (v.includes('active') || v.includes('paid')) return 'ACTIVE'
  return 'ACTIVE'
}

function toInternalTxStatus(s: string | null | undefined): string {
  const v = (s || '').toString().toLowerCase()
  if (v.includes('paid') || v.includes('approved') || v === 'succeeded') return 'paid'
  if (v.includes('failed') || v.includes('refused') || v.includes('canceled')) return 'failed'
  if (v.includes('processing') || v.includes('pending')) return 'processing'
  return 'processing'
}

function constantTimeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a)
  const bb = Buffer.from(b)
  if (aa.length !== bb.length) return false
  return crypto.timingSafeEqual(aa, bb)
}

async function verifySignature(req: NextRequest, raw: string, clinicId: string | null): Promise<{ ok: boolean, hasSecret: boolean }> {
  // Try resolve webhook secret by clinicId from merchant_integrations
  if (!clinicId) return { ok: false, hasSecret: false }
  const creds = await getKrxpayCredentialsByClinicId(clinicId).catch(() => null)
  const secret = creds?.webhookSecret || null
  if (!secret) return { ok: false, hasSecret: false }
  // Common header names
  const sig = req.headers.get('x-krx-signature')
    || req.headers.get('x-pagarme-signature')
    || req.headers.get('x-hub-signature-256')
    || req.headers.get('x-hub-signature')
  if (!sig) return { ok: false, hasSecret: true }
  // Use sha256 HMAC
  const computed = 'sha256=' + crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('hex')
  return { ok: constantTimeEqual(computed, sig), hasSecret: true }
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text()
    const body = safeJsonParse<any>(raw) || {}

    // Event envelope expectations (best-effort for KRXLabs/Pagar.me)
    const type: string = body?.type || body?.event || ''
    const data: any = body?.data || body?.payload || body?.resource || body || {}

    // Try to extract clinicId/merchant context from metadata
    const meta = (data?.metadata || data?.subscription?.metadata || data?.plan?.metadata || {}) as any
    const clinicId: string | null = (meta?.clinicId || meta?.clinic_id || null) ? String(meta.clinicId || meta.clinic_id) : null

    // Require clinicId scoping from payload metadata
    if (!clinicId) {
      return NextResponse.json({ error: 'missing_clinic_scope' }, { status: 400 })
    }

    // Verify signature when secret + header are available; if secret exists and verification fails, reject
    const sig = await verifySignature(req, raw, clinicId)
    if (sig.hasSecret && !sig.ok) {
      return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
    }

    // Resolve merchant by clinic
    let merchantId: string | null = null
    if (clinicId) {
      try {
        const m = await prisma.merchant.findFirst({ where: { clinicId: String(clinicId) }, select: { id: true } })
        merchantId = m?.id || null
      } catch {}
    }

    // Handlers
    const lowerType = (type || '').toLowerCase()
    // Subscription events
    if (lowerType.includes('subscription')) {
      const sub = data?.subscription || data
      const providerSubId: string | null = (sub?.id || sub?.subscription_id || null) ? String(sub.id || sub.subscription_id) : null
      const status = toInternalSubStatus(sub?.status)
      const startAt = sub?.start_at || sub?.startAt || null
      const curStart = sub?.current_period_start || sub?.current_period?.start_at || null
      const curEnd = sub?.current_period_end || sub?.current_period?.end_at || null
      const productId = meta?.productId ? String(meta.productId) : null
      const offerId = meta?.offerId ? String(meta.offerId) : null

      if (providerSubId && merchantId) {
        const csId = crypto.randomUUID()
        await prisma.$executeRawUnsafe(
          `INSERT INTO customer_subscriptions (
             id, provider_subscription_id, status, customer_id, product_id, offer_id, merchant_id, start_at, current_period_start, current_period_end, metadata
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb
           )
           ON CONFLICT (provider_subscription_id) DO UPDATE SET
             status = EXCLUDED.status,
             current_period_start = EXCLUDED.current_period_start,
             current_period_end = EXCLUDED.current_period_end,
             updated_at = NOW(),
             metadata = COALESCE(customer_subscriptions.metadata, '{}'::jsonb) || EXCLUDED.metadata`,
          csId,
          providerSubId,
          status,
          null,
          productId,
          offerId,
          merchantId,
          startAt,
          curStart,
          curEnd,
          JSON.stringify(meta || {}),
        )
      }

      return NextResponse.json({ ok: true })
    }

    // Charge/Invoice/Order events (payments)
    if (lowerType.includes('charge') || lowerType.includes('invoice') || lowerType.includes('order') || data?.last_transaction) {
      const order = data?.order || data
      const charge = data?.charge || data?.last_transaction || data
      const status = toInternalTxStatus(charge?.status || order?.status)
      const amountCents = Number(charge?.paid_amount || charge?.amount || order?.amount || 0)
      const currency = (order?.currency || charge?.currency || 'BRL').toString().toUpperCase()
      const providerOrderId = String(order?.id || data?.order_id || '') || null
      const providerChargeId = String(charge?.id || data?.charge_id || '') || null
      const providerSubId = data?.subscription_id || data?.subscription?.id || null
      const providerEventId = (data?.id || body?.id || body?.event_id || null) ? String(data?.id || body?.id || body?.event_id) : null

      // Split: estimate values; precise split can be recomputed elsewhere (fees vary)
      let clinicSplitPercent = 70
      let platformFeeBps = 0
      let transactionFeeCents = 0
      if (clinicId) {
        try {
          const m = await prisma.merchant.findFirst({ where: { clinicId: String(clinicId) }, select: { splitPercent: true, platformFeeBps: true, transactionFeeCents: true } })
          if (m?.splitPercent != null) clinicSplitPercent = Math.max(0, Math.min(100, Number(m.splitPercent)))
          if (m?.platformFeeBps != null) platformFeeBps = Math.max(0, Number(m.platformFeeBps))
          if (m?.transactionFeeCents != null) transactionFeeCents = Math.max(0, Number(m.transactionFeeCents))
        } catch {}
      }
      const gross = Number.isFinite(amountCents) ? Number(amountCents) : 0
      const clinicShare = Math.round(gross * (clinicSplitPercent / 100))
      const feePercent = Math.round(gross * (platformFeeBps / 10000))
      const feeFlat = transactionFeeCents
      const platformFeeTotal = Math.max(0, feePercent + feeFlat)
      const clinicAmountCents = Math.max(0, clinicShare - platformFeeTotal)
      const platformAmountCents = Math.max(0, gross - clinicAmountCents)

      if (merchantId) {
        const txId = crypto.randomUUID()
        // Check if payment_transactions has provider_event_id column
        let hasEventIdCol = false
        try {
          const cols: any[] = await prisma.$queryRawUnsafe(
            `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payment_transactions' AND column_name = 'provider_event_id' LIMIT 1`
          )
          hasEventIdCol = Array.isArray(cols) && !!cols[0]
        } catch {}

        if (hasEventIdCol && providerEventId) {
          await prisma.$executeRawUnsafe(
            `INSERT INTO payment_transactions (
               id, provider, provider_event_id, provider_order_id, provider_charge_id, merchant_id, clinic_id, product_id, customer_subscription_id,
               amount_cents, clinic_amount_cents, platform_amount_cents, platform_fee_cents, currency, installments, payment_method_type, status, raw_payload
             ) VALUES (
               $1, 'pagarme', $2, $3, $4, $5, $6, $7, $8,
               $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb
             )
             ON CONFLICT (provider, provider_event_id) DO UPDATE SET
               status = EXCLUDED.status,
               amount_cents = EXCLUDED.amount_cents,
               clinic_amount_cents = EXCLUDED.clinic_amount_cents,
               platform_amount_cents = EXCLUDED.platform_amount_cents,
               platform_fee_cents = EXCLUDED.platform_fee_cents,
               updated_at = NOW()`,
            txId,
            providerEventId,
            providerOrderId,
            providerChargeId,
            merchantId,
            clinicId ? String(clinicId) : null,
            meta?.productId ? String(meta.productId) : null,
            providerSubId ? String(providerSubId) : null,
            gross,
            clinicAmountCents,
            platformAmountCents,
            platformFeeTotal,
            currency,
            1,
            (charge?.payment_method || order?.payment_method || 'card'),
            status,
            JSON.stringify({ order, charge, meta })
          )
        } else {
          await prisma.$executeRawUnsafe(
            `INSERT INTO payment_transactions (
               id, provider, provider_order_id, provider_charge_id, merchant_id, clinic_id, product_id, customer_subscription_id,
               amount_cents, clinic_amount_cents, platform_amount_cents, platform_fee_cents, currency, installments, payment_method_type, status, raw_payload
             ) VALUES (
               $1, 'pagarme', $2, $3, $4, $5, $6, $7,
               $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb
             )
             ON CONFLICT (provider, provider_order_id, provider_charge_id) DO UPDATE SET
               status = EXCLUDED.status,
               amount_cents = EXCLUDED.amount_cents,
               clinic_amount_cents = EXCLUDED.clinic_amount_cents,
               platform_amount_cents = EXCLUDED.platform_amount_cents,
               platform_fee_cents = EXCLUDED.platform_fee_cents,
               updated_at = NOW()`,
            txId,
            providerOrderId,
            providerChargeId,
            merchantId,
            clinicId ? String(clinicId) : null,
            meta?.productId ? String(meta.productId) : null,
            providerSubId ? String(providerSubId) : null,
            gross,
            clinicAmountCents,
            platformAmountCents,
            platformFeeTotal,
            currency,
            1,
            (charge?.payment_method || order?.payment_method || 'card'),
            status,
            JSON.stringify({ order, charge, meta })
          )
        }
      }

      return NextResponse.json({ ok: true })
    }

    // Fallback
    return NextResponse.json({ ok: true, ignored: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'internal_error' }, { status: 500 })
  }
}
