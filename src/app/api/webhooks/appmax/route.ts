import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

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
  try {
    const raw = await req.text()
    let evt: any = {}
    try { evt = raw ? JSON.parse(raw) : {} } catch { evt = {} }

    const event = String(evt?.event || evt?.type || '')
    const data = evt?.data || {}
    // In Default template, order id is data.id and customer under data.customer
    const orderId = data?.id ? String(data.id) : null
    const statusRaw = data?.status || evt?.status || null
    const paymentType = data?.payment_type || data?.paymentType || null
    const installments = data?.installments != null ? Number(data.installments) : null

    console.log('[appmax][webhook] 📥 Received', { event, orderId, statusRaw, paymentType })

    // Idempotent log of webhook
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO webhook_events (provider, hook_id, provider_event_id, type, status, raw)
         VALUES ('appmax', COALESCE($1,$2), $2, $3, $4, $5::jsonb)
         ON CONFLICT (provider, hook_id) DO NOTHING`,
        String(evt?.id || ''),
        String(orderId || ''),
        String(event),
        String(statusRaw || ''),
        JSON.stringify(evt)
      )
    } catch {}

    if (!orderId) return NextResponse.json({ received: true, ignored: true, reason: 'no order id' })

    const mapped = mapStatus(String(statusRaw || ''))
    const methodNorm = paymentType ? String(paymentType).toLowerCase() : undefined

    // Extract buyer info when available
    const cust = data?.customer || {}
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
               status_v2 = CASE
                             WHEN ($2::text) = 'paid' THEN 'SUCCEEDED'::"PaymentStatus"
                             WHEN ($2::text) IN ('processing','pending','authorized') THEN 'PROCESSING'::"PaymentStatus"
                             WHEN ($2::text) = 'failed' THEN 'FAILED'::"PaymentStatus"
                             WHEN ($2::text) = 'canceled' THEN 'CANCELED'::"PaymentStatus"
                             WHEN ($2::text) = 'refunded' THEN 'REFUNDED'::"PaymentStatus"
                             ELSE status_v2
                           END,
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
        buyerEmail
      )
      console.log('[appmax][webhook] ✅ Updated transaction', { orderId, mapped, rows: result })
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

          // 1) Upsert PaymentCustomer (provider_customer_id = appmax customer.id)
          const appmaxCustomerId = cust?.id ? String(cust.id) : null
          if (appmaxCustomerId) {
            const pcId = crypto.randomUUID()
            await prisma.$executeRawUnsafe(
              `INSERT INTO payment_customers (id, provider, provider_customer_id, doctor_id, patient_profile_id, clinic_id)
               VALUES ($1, 'appmax', $2, $3, $4, $5)
               ON CONFLICT (doctor_id, patient_profile_id, provider)
               DO UPDATE SET provider_customer_id = EXCLUDED.provider_customer_id`,
              pcId,
              String(appmaxCustomerId),
              doctorId,
              patientProfileId,
              clinicId
            )
            console.log('[appmax][webhook] ✅ Upserted payment_customer', { pcId, appmaxCustomerId, doctorId, patientProfileId })
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
