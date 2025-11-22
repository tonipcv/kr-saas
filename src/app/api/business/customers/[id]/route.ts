import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/business/customers/[id]?clinicId=...
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const clinicId = String(searchParams.get('clinicId') || '')
    const { id } = await context.params
    const customerId = String(id || '')
    if (!clinicId || !customerId) return NextResponse.json({ error: 'clinicId and id are required' }, { status: 400 })

    // Access check (owner or active member); allow dev fallback if clinic exists
    let clinic = await prisma.clinic.findFirst({
      where: {
        id: clinicId,
        OR: [
          { ownerId: session.user.id },
          { members: { some: { userId: session.user.id, isActive: true } } },
        ],
      },
      select: { id: true, name: true },
    })
    if (!clinic) {
      const exists = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { id: true, name: true } })
      if (!exists) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      clinic = exists
    }

    const merchant = await prisma.merchant.findFirst({ where: { clinicId }, select: { id: true } })
    if (!merchant) return NextResponse.json({ error: 'No merchant for clinic' }, { status: 404 })

    // Core customer info (ensure belongs to merchant)
    const custRows: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, name, email, phone, document, created_at as "createdAt", updated_at as "updatedAt"
         FROM customers
        WHERE id = $1 AND merchant_id = $2
        LIMIT 1`,
      customerId,
      String(merchant.id),
    ) as any[]
    const customer = custRows?.[0] || null
    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

    // Providers
    const providers: any[] = await prisma.$queryRawUnsafe(
      `SELECT provider, account_id as "accountId", provider_customer_id as "providerCustomerId", created_at as "createdAt"
         FROM customer_providers
        WHERE customer_id = $1
        ORDER BY provider ASC, created_at DESC`,
      customerId,
    ) as any[]

    // Payment Methods
    const paymentMethods: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, provider, account_id as "accountId", brand, last4, exp_month as "expMonth", exp_year as "expYear", status, is_default as "isDefault", created_at as "createdAt"
         FROM customer_payment_methods
        WHERE customer_id = $1
        ORDER BY is_default DESC, created_at DESC
        LIMIT 50`,
      customerId,
    ) as any[]

    // Subscriptions
    const subscriptions: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, provider, account_id as "accountId", status, price_cents as "priceCents", currency,
              start_at as "startAt", trial_ends_at as "trialEndsAt", current_period_start as "currentPeriodStart",
              current_period_end as "currentPeriodEnd", provider_subscription_id as "providerSubscriptionId",
              metadata, updated_at as "updatedAt"
         FROM customer_subscriptions
        WHERE customer_id = $1 AND merchant_id = $2
        ORDER BY updated_at DESC
        LIMIT 100`,
      customerId,
      String(merchant.id),
    ) as any[]

    // Charges / Transactions
    const transactions: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, provider, provider_order_id as "providerOrderId", provider_charge_id as "providerChargeId",
              status, status_v2 as "statusV2", amount_cents as "amountCents", currency,
              payment_method_type as "paymentMethodType", installments, product_id as "productId",
              created_at as "createdAt", updated_at as "updatedAt"
         FROM payment_transactions
        WHERE customer_id = $1
        ORDER BY created_at DESC
        LIMIT 200`,
      customerId,
    ) as any[]

    return NextResponse.json({
      customer,
      providers,
      paymentMethods,
      subscriptions,
      transactions,
    })
  } catch (e: any) {
    console.error('[GET /api/business/customers/[id]] Error:', e?.message || e)
    return NextResponse.json({ error: 'Failed to load customer details' }, { status: 500 })
  }
}

// DELETE /api/business/customers/[id]?clinicId=...
export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const clinicId = String(searchParams.get('clinicId') || '')
    const { id } = await context.params
    const customerId = String(id || '')
    if (!clinicId || !customerId) return NextResponse.json({ error: 'clinicId and id are required' }, { status: 400 })

    // Access check
    let clinic = await prisma.clinic.findFirst({
      where: {
        id: clinicId,
        OR: [
          { ownerId: session.user.id },
          { members: { some: { userId: session.user.id, isActive: true } } },
        ],
      },
      select: { id: true },
    })
    if (!clinic) {
      const exists = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { id: true } })
      if (!exists) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      clinic = exists
    }

    const merchant = await prisma.merchant.findFirst({ where: { clinicId }, select: { id: true } })
    if (!merchant) return NextResponse.json({ error: 'No merchant for clinic' }, { status: 404 })

    // Ensure the customer belongs to this merchant
    const owns = await prisma.$queryRawUnsafe<any[]>(
      `SELECT 1 FROM customers WHERE id = $1 AND merchant_id = $2 LIMIT 1`,
      customerId,
      String(merchant.id),
    )
    if (!Array.isArray(owns) || owns.length === 0) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    // Delete related objects first (keep transactions for history, but nullify link)
    await prisma.$executeRawUnsafe(
      `UPDATE payment_transactions SET customer_id = NULL WHERE customer_id = $1`,
      customerId,
    )
    await prisma.$executeRawUnsafe(
      `DELETE FROM customer_payment_methods WHERE customer_id = $1`,
      customerId,
    )
    await prisma.$executeRawUnsafe(
      `DELETE FROM customer_providers WHERE customer_id = $1`,
      customerId,
    )
    await prisma.$executeRawUnsafe(
      `DELETE FROM customer_subscriptions WHERE customer_id = $1 AND merchant_id = $2`,
      customerId,
      String(merchant.id),
    )
    await prisma.$executeRawUnsafe(
      `DELETE FROM customers WHERE id = $1 AND merchant_id = $2`,
      customerId,
      String(merchant.id),
    )

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[DELETE /api/business/customers/[id]] Error:', e?.message || e)
    return NextResponse.json({ error: 'Failed to delete customer' }, { status: 500 })
  }
}
