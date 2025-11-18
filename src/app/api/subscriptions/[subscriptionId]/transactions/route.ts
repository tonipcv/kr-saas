import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(req: Request, { params }: { params: Promise<{ subscriptionId: string }> }) {
  const { subscriptionId } = await params
  try {
    const session = await getServerSession(authOptions as any)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!subscriptionId) return NextResponse.json({ error: 'Missing subscriptionId' }, { status: 400 })

    // Resolve subscription including merchant for scoping
    const subRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, customer_id, product_id, merchant_id FROM customer_subscriptions WHERE id = $1 LIMIT 1`,
      String(subscriptionId)
    ).catch(() => [])
    const sub = Array.isArray(subRows) && subRows[0] ? subRows[0] : null
    if (!sub) return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })

    // Resolve clinicId from merchant and verify user belongs to that clinic
    const merchant = await prisma.merchant.findUnique({ where: { id: String(sub.merchant_id) }, select: { clinicId: true } }).catch(() => null as any)
    const clinicId: string | null = merchant?.clinicId || null
    if (!clinicId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const clinic = await prisma.clinic.findFirst({
      where: {
        id: String(clinicId),
        OR: [
          { ownerId: String(session.user.id) },
          { members: { some: { userId: String(session.user.id), isActive: true } } },
        ],
      },
      select: { id: true },
    })
    if (!clinic) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // List transactions restricted to the same merchant_id
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT pt.id,
              pt.provider,
              pt.provider_order_id,
              pt.provider_charge_id,
              pt.amount_cents,
              pt.currency,
              pt.status,
              pt.status_v2,
              pt.created_at,
              pt.updated_at,
              pt.billing_period_start,
              pt.billing_period_end,
              pt.product_id,
              p.name as product_name,
              pt.client_name,
              pt.client_email
         FROM payment_transactions pt
    LEFT JOIN products p ON p.id = pt.product_id
        WHERE (
               pt.customer_subscription_id = $1 AND pt.merchant_id = $4
              )
           OR (
               $2::text IS NOT NULL AND $3::text IS NOT NULL AND pt.customer_id = $2 AND pt.product_id = $3 AND pt.merchant_id = $4
              )
        ORDER BY pt.updated_at DESC NULLS LAST, pt.created_at DESC
        LIMIT 200`,
      String(subscriptionId),
      sub?.customer_id || null,
      sub?.product_id || null,
      String(sub.merchant_id),
    ).catch(() => [])

    return NextResponse.json({ data: rows }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to list transactions' }, { status: 500 })
  }
}
