import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { onPaymentTransactionStatusChanged } from '@/lib/webhooks/emit-updated'
import { normalizeProviderStatus } from '@/lib/payments/status-map'
import crypto from 'crypto'

// DEPRECATED: use normalizeProviderStatus instead
function mapStatus(pt: string): string | undefined {
  const s = String(pt || '').toLowerCase()
  if (!s) return undefined
  if (s.includes('aprov')) return 'paid'
  if (s.includes('autor')) return 'authorized'
  if (s.includes('pend')) return 'pending'
  if (s.includes('integr')) return 'paid'
  if (s.includes('estorn')) return 'refunded'
  if (s.includes('cancel')) return 'canceled'
  if (s.includes('falh') || s.includes('negad')) return 'failed'
  return undefined
}

export async function POST(req: Request) {
  let orderId: string | null = null
  try {
    const contentType = (req.headers.get('content-type') || '').toLowerCase().split(';')[0]
    const raw = await req.text()
    try { console.log('[appmax][webhook] headers', { contentType, rawLen: raw?.length || 0 }) } catch {}
    let evt: any = {}
    // Try JSON first
    try { evt = raw ? JSON.parse(raw) : {} } catch { evt = {} }
    // Fallback: form-urlencoded
    if ((!evt || Object.keys(evt).length === 0) && contentType.includes('application/x-www-form-urlencoded')) {
      try {
        const params = new URLSearchParams(raw)
        const obj: any = {}
        for (const entry of Array.from(params.entries())) {
          const k = entry[0]
          const v = entry[1]
          // Support keys like data[id] => obj.data.id
          if (k.includes('[')) {
            const parts = k.replace(/\]/g, '').split('[')
            let ref: any = obj
            for (let i = 0; i < parts.length; i++) {
              const part = parts[i]
              if (i === parts.length - 1) ref[part] = v
              else ref = (ref[part] = ref[part] || {})
            }
          } else {
            obj[k] = v
          }
        }
        evt = obj
        console.log('[appmax][webhook] parsed form-urlencoded fallback')
      } catch (e) {
        console.warn('[appmax][webhook] failed to parse form-urlencoded fallback')
      }
    }

    const rawStatus = String(evt?.status || evt?.data?.status || '')
    // Use centralized normalizer
    const normalized = normalizeProviderStatus('APPMAX', rawStatus)
    const mapped = normalized.legacy
    const internalStatus = normalized.internal
    // In Default template, order id is data.id and customer under data.customer
    orderId = evt?.data?.id ? String(evt.data.id) : null
    const statusRaw = evt?.data?.status || evt?.status || null
    const paymentType = evt?.data?.payment_type || evt?.data?.paymentType || null
    const installments = evt?.data?.installments != null ? Number(evt.data.installments) : null

    console.log('[appmax][webhook] 📥 Received', {
      provider: 'appmax',
      orderId,
      statusRaw,
      paymentType,
      hasData: !!evt?.data,
    })

    // Idempotent log of webhook
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO webhook_events (provider, hook_id, provider_event_id, type, status, raw)
         VALUES ('appmax', COALESCE($1,$2), $2, $3, $4, $5::jsonb)
         ON CONFLICT (provider, hook_id) DO NOTHING`,
        String(evt?.id || ''),
        String(orderId || ''),
        String(evt?.type || evt?.event || ''),
        String(statusRaw || ''),
        JSON.stringify(evt)
      )
    } catch {}

    if (!orderId) return NextResponse.json({ received: true, ignored: true, reason: 'no order id' })

    const methodNorm = paymentType ? String(paymentType).toLowerCase() : undefined

    // Extract buyer info when available
    const cust = evt?.data?.customer || {}
    const buyerName = [cust?.firstname, cust?.lastname].filter(Boolean).join(' ').trim() || null
    const buyerEmail = cust?.email || null

    // Anti-downgrade CASE logic similar to other providers + enums
    try {
      const result = await prisma.$executeRawUnsafe(
        `UPDATE payment_transactions
           SET status = CASE
                          WHEN ($2::text) IS NULL THEN status
                          WHEN status = 'pending' AND ($2::text) IN ('processing','paid','refunded','canceled','failed','authorized') THEN ($2::text)
                          WHEN status = 'processing' AND ($2::text) IN ('paid','refunded','canceled','failed','authorized') THEN ($2::text)
                          WHEN status = 'authorized' AND ($2::text) IN ('paid','refunded','canceled','failed') THEN ($2::text)
                          WHEN status = 'paid' AND ($2::text) IN ('refunded','canceled','failed') THEN ($2::text)
                          WHEN status = 'refunded' AND ($2::text) IN ('canceled','failed') THEN ($2::text)
                          WHEN status = 'canceled' AND ($2::text) = 'failed' THEN ($2::text)
                          ELSE status
                        END,
               status_v2 = COALESCE($8::"PaymentStatus", status_v2),
               provider_v2 = COALESCE(provider_v2, 'APPMAX'::"PaymentProvider"),
               payment_method_type = COALESCE($3::text, payment_method_type),
               installments = COALESCE($4::int, installments),
               raw_payload = $5::jsonb,
               client_name = COALESCE(client_name, $6::text),
               client_email = COALESCE(client_email, $7::text),
               updated_at = NOW()
         WHERE provider = 'appmax' AND provider_order_id = $1`,
        String(orderId),
        mapped || null,
        methodNorm || null,
        installments || null,
        JSON.stringify(evt),
        buyerName,
        buyerEmail,
        internalStatus || null
      )
      console.log('[appmax][webhook] ✅ Updated transaction', { orderId, mapped, rows: result })
      
      // Emit outbound webhook event
      if (result > 0 && mapped) {
        try {
          const tx = await prisma.paymentTransaction.findFirst({
            where: { provider: 'appmax', providerOrderId: String(orderId) },
            select: { id: true, clinicId: true, status_v2: true }
          })
          if (tx?.clinicId && tx?.status_v2) {
            await onPaymentTransactionStatusChanged(tx.id, String(tx.status_v2))
          }
        } catch (e) {
          console.warn('[appmax][webhook] outbound event emission failed (non-blocking)', e instanceof Error ? e.message : e)
        }
      }
    } catch (e) {
      console.warn('[appmax][webhook] ⚠️  Update failed', e instanceof Error ? e.message : String(e))
    }

    // If no prior row exists, create a placeholder with enums
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO payment_transactions (
           id, provider, provider_order_id, status, provider_v2, status_v2, payment_method_type, installments,
           amount_cents, currency, raw_payload, created_at, routed_provider, client_name, client_email
         ) VALUES (
           gen_random_uuid(), 'appmax', $1, COALESCE($2::text,'processing'), 'APPMAX'::"PaymentProvider", CASE WHEN $2='paid' THEN 'SUCCEEDED'::"PaymentStatus" WHEN $2='failed' THEN 'FAILED'::"PaymentStatus" ELSE 'PROCESSING'::"PaymentStatus" END, $3::text, $4::int,
           0, 'BRL', $5::jsonb, NOW(), 'APPMAX', $6::text, $7::text
         ) ON CONFLICT DO NOTHING`,
        String(orderId),
        mapped || null,
        methodNorm || null,
        installments || null,
        JSON.stringify(evt),
        buyerName,
        buyerEmail
      )
      console.log('[appmax][webhook] ✅ Created early transaction', { orderId, mapped })
    } catch (e) {
      console.warn('[appmax][webhook] ⚠️  Insert failed', e instanceof Error ? e.message : String(e))
    }

    // CRITICAL: Create PaymentCustomer, PaymentMethod and Purchase when paid (like Pagar.me)
    if (mapped === 'paid') {
      try {
        // Lookup transaction row to get doctor_id, patient_profile_id, product_id, clinic_id, amount
        const txRows = await prisma.$queryRawUnsafe<any[]>(
          `SELECT id, doctor_id, patient_profile_id, product_id, clinic_id, amount_cents
             FROM payment_transactions
            WHERE provider = 'appmax' AND provider_order_id = $1
            LIMIT 1`,
          String(orderId)
        )
        const tx = txRows?.[0] || null
        if (tx && tx.doctor_id && tx.patient_profile_id) {
          const doctorId = String(tx.doctor_id)
          const patientProfileId = String(tx.patient_profile_id)
          const productId = tx.product_id ? String(tx.product_id) : null
          const clinicId = tx.clinic_id ? String(tx.clinic_id) : null
          const amountCents = Number(tx.amount_cents || 0)

          // 1) Ensure Unified Customer and upsert customer_providers (APPMAX)
          const appmaxCustomerId = cust?.id ? String(cust.id) : null
          try {
            // Resolve merchant by clinicId
            let merchantId: string | null = null
            try {
              if (clinicId) {
                const m = await prisma.merchant.findFirst({ where: { clinicId: String(clinicId) }, select: { id: true } })
                merchantId = m?.id || null
              }
            } catch {}
            // Resolve or create Customer by merchant+buyer email
            let unifiedCustomerId: string | null = null
            try {
              if (merchantId && buyerEmail) {
                const existing = await prisma.customer.findFirst({ where: { merchantId: String(merchantId), email: String(buyerEmail) }, select: { id: true } })
                if (existing?.id) unifiedCustomerId = existing.id
                else {
                  const created = await prisma.customer.create({ data: { merchantId: String(merchantId), email: String(buyerEmail), name: buyerName || null } as any, select: { id: true } } as any)
                  unifiedCustomerId = created.id
                }
              }
            } catch {}
            // Upsert provider mapping and link payment transaction to customer
            if (unifiedCustomerId && merchantId) {
              if (appmaxCustomerId) {
                const existProv: any[] = await prisma.$queryRawUnsafe<any[]>(
                  `SELECT id FROM customer_providers WHERE customer_id = $1 AND provider = 'APPMAX' AND account_id = $2 LIMIT 1`,
                  String(unifiedCustomerId), String(merchantId)
                ).catch(() => [])
                if (existProv && existProv.length) {
                  await prisma.$executeRawUnsafe(
                    `UPDATE customer_providers SET provider_customer_id = $2, updated_at = NOW() WHERE id = $1`,
                    String(existProv[0].id), String(appmaxCustomerId)
                  )
                } else {
                  await prisma.$executeRawUnsafe(
                    `INSERT INTO customer_providers (id, customer_id, provider, account_id, provider_customer_id, created_at, updated_at)
                     VALUES (gen_random_uuid(), $1, 'APPMAX'::"PaymentProvider", $2, $3, NOW(), NOW())`,
                    String(unifiedCustomerId), String(merchantId), String(appmaxCustomerId)
                  )
                }
              }
              // Link transaction to unified customer
              await prisma.$executeRawUnsafe(
                `UPDATE payment_transactions SET customer_id = $2, updated_at = NOW() WHERE provider = 'appmax' AND provider_order_id = $1 AND customer_id IS NULL`,
                String(orderId), String(unifiedCustomerId)
              )
            }
          } catch (e) {
            console.warn('[appmax][webhook] mirror to unified customer tables failed', e instanceof Error ? e.message : e)
          }

          // 2) Upsert PaymentMethod if card data present
          // Appmax webhook typically does not return card details; skip if unavailable
          // If you need card storage, capture it in /api/checkout/appmax/create instead

          // 3) Create Purchase for the paid transaction
          if (productId) {
            const existingPurchase = await prisma.purchase.findFirst({
              where: { externalIdempotencyKey: String(orderId) }
            })
            if (!existingPurchase) {
              // Resolve userId from patientProfile
              const profRows = await prisma.$queryRawUnsafe<any[]>(
                `SELECT user_id FROM patient_profiles WHERE id = $1 LIMIT 1`,
                patientProfileId
              )
              const userId = profRows?.[0]?.user_id ? String(profRows[0].user_id) : null
              if (userId) {
                const price = amountCents / 100
                await prisma.purchase.create({
                  data: {
                    userId: String(userId),
                    doctorId: String(doctorId),
                    productId: String(productId),
                    quantity: 1,
                    unitPrice: price as any,
                    totalPrice: price as any,
                    pointsAwarded: 0 as any,
                    status: 'COMPLETED',
                    externalIdempotencyKey: String(orderId),
                    notes: 'Created via AppMax webhook (paid)',
                  } as any,
                })
                console.log('[appmax][webhook] ✅ Created purchase', { orderId, userId, productId, price })
              }
            }
          }
        }
      } catch (e) {
        console.warn('[appmax][webhook] paid backfill failed:', e instanceof Error ? e.message : e)
      }

      // Activate subscriptions when payment confirms
      try {
        const subRows: any[] = await prisma.$queryRawUnsafe(
          `SELECT id, product_id, offer_id FROM customer_subscriptions 
           WHERE metadata->>'appmaxOrderId' = $1 AND status = 'PENDING' LIMIT 1`,
          String(orderId)
        );
        if (subRows && subRows.length > 0) {
          const subRow = subRows[0];
          // Calculate period dates from payment confirmation
          const paidAt = new Date();
          let periodStart = paidAt;
          let periodEnd = new Date(paidAt);
          
          // Get interval from offer or product
          let intervalUnit = 'MONTH';
          let intervalCount = 1;
          try {
            if (subRow.offer_id) {
              const offer = await prisma.offer.findUnique({ where: { id: String(subRow.offer_id) }, select: { intervalUnit: true, intervalCount: true } });
              if (offer?.intervalUnit) intervalUnit = String(offer.intervalUnit).toUpperCase();
              if (offer?.intervalCount) intervalCount = Number(offer.intervalCount) || 1;
            } else if (subRow.product_id) {
              const product = await prisma.product.findUnique({ where: { id: String(subRow.product_id) }, select: { interval: true, intervalCount: true } } as any);
              if ((product as any)?.interval) intervalUnit = String((product as any).interval).toUpperCase();
              if ((product as any)?.intervalCount) intervalCount = Number((product as any).intervalCount) || 1;
            }
          } catch {}
          
          // Calculate end date based on interval
          if (intervalUnit === 'DAY') periodEnd.setDate(periodEnd.getDate() + intervalCount);
          else if (intervalUnit === 'WEEK') periodEnd.setDate(periodEnd.getDate() + 7 * intervalCount);
          else if (intervalUnit === 'MONTH') periodEnd.setMonth(periodEnd.getMonth() + intervalCount);
          else if (intervalUnit === 'YEAR') periodEnd.setFullYear(periodEnd.getFullYear() + intervalCount);
          
          await prisma.$executeRawUnsafe(
            `UPDATE customer_subscriptions 
             SET status = 'ACTIVE'::"SubscriptionStatus",
                 current_period_start = $2::timestamp,
                 current_period_end = $3::timestamp,
                 start_at = COALESCE(start_at, $2::timestamp),
                 updated_at = NOW()
             WHERE id = $1`,
            String(subRow.id),
            periodStart,
            periodEnd
          );
          console.log('[appmax][webhook] ✅ Activated subscription', { subscriptionId: subRow.id, orderId, periodStart, periodEnd, interval: intervalUnit, count: intervalCount });

          // Mirror period dates and subscription linkage into payment_transaction for richer webhook payloads
          try {
            await prisma.$executeRawUnsafe(
              `UPDATE payment_transactions
                 SET customer_subscription_id = COALESCE(customer_subscription_id, $2::text),
                     billing_period_start = COALESCE(billing_period_start, $3::timestamp),
                     billing_period_end = COALESCE(billing_period_end, $4::timestamp),
                     paid_at = COALESCE(paid_at, NOW()),
                     updated_at = NOW()
               WHERE provider = 'appmax' AND provider_order_id = $1`,
              String(orderId),
              String(subRow.id),
              periodStart,
              periodEnd
            );
            console.log('[appmax][webhook] ✅ mirrored billing period into payment_transaction', { orderId, subscriptionId: subRow.id });
          } catch (e) {
            console.warn('[appmax][webhook] mirror billing period into payment_transaction failed:', e instanceof Error ? e.message : e);
          }
        }
      } catch (e) {
        console.warn('[appmax][webhook] subscription activation failed:', e instanceof Error ? e.message : e);
      }
    }
    return NextResponse.json({ received: true })
  } catch (e: any) {
  console.error('[appmax][webhook] processing error', e)
  
  // CRITICAL: Mesmo com erro, SEMPRE retorna 200 para evitar reenvios duplicados
  // Marca webhook para retry via worker
  if (orderId) {
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE webhook_events 
         SET next_retry_at = NOW(), 
             processing_error = $2,
             is_retryable = true
         WHERE provider = 'appmax' AND provider_event_id = $1`,
        String(orderId),
        String(e?.message || 'Unknown error').substring(0, 5000)
      )
    } catch {}
  }
  
  return NextResponse.json({ received: true, will_retry: true }, { status: 200 })
}
}
