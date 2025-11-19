import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
// Note: external providers listing removed. We now list from internal customer_subscriptions (by merchant).

// GET /api/subscriptions?clinicId=...&page=1&page_size=20&from=...&to=...
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const clinicId = searchParams.get('clinicId') || '';
    const page = Number(searchParams.get('page') || '1');
    const pageSize = Number(searchParams.get('page_size') || '20');
    const from = searchParams.get('from') || undefined;
    const to = searchParams.get('to') || undefined;

    if (!clinicId) {
      return NextResponse.json({ error: 'clinicId is required' }, { status: 400 });
    }

    // Simple access check: user must be clinic owner or part of clinic team
    const clinic = await prisma.clinic.findFirst({
      where: {
        id: clinicId,
        OR: [
          { ownerId: session.user.id },
          {
            members: {
              some: {
                userId: session.user.id,
                isActive: true,
              },
            },
          },
        ],
      },
      select: { id: true, name: true },
    });
    if (!clinic) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Resolve merchant from clinic
    const merchant = await prisma.merchant.findFirst({ where: { clinicId }, select: { id: true } });
    if (!merchant) {
      return NextResponse.json({ data: [], pagination: { page, page_size: pageSize, total: 0 } }, { status: 200 });
    }

    // List internal customer subscriptions by merchant using raw SQL (snake_case)
    const offset = Math.max(0, (page - 1) * pageSize);
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT 
         id,
         provider_subscription_id as "providerSubscriptionId",
         provider,
         status,
         customer_id as "customerId",
         product_id as "productId",
         offer_id as "offerId",
         start_at as "startAt",
         current_period_start as "currentPeriodStart",
         current_period_end as "currentPeriodEnd",
         updated_at as "updatedAt",
         metadata,
         (SELECT COUNT(1) FROM payment_transactions pt WHERE pt.customer_subscription_id = customer_subscriptions.id) AS "chargesCount"
       FROM customer_subscriptions
       WHERE merchant_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      merchant.id,
      pageSize,
      offset,
    ) as any[];
    const totalRow: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(1)::int as count FROM customer_subscriptions WHERE merchant_id = $1`,
      merchant.id,
    ) as any[];
    const total = (totalRow?.[0]?.count as number) || 0;

    // Enrich product names
    const productIds = Array.from(new Set(rows.map((r: any) => String(r.productId || '')).filter(Boolean)));
    const products = productIds.length > 0 ? await prisma.products.findMany({ select: { id: true, name: true }, where: { id: { in: productIds } } }) : [];
    const productMap = new Map(products.map(p => [p.id, p.name]));

    // Enrich customers
    const customerIds = Array.from(new Set(rows.map(r => String(r.customerId || '')).filter(Boolean)));
    const customers = customerIds.length > 0 ? await prisma.customer.findMany({ select: { id: true, name: true, email: true }, where: { id: { in: customerIds } } }) : [];
    const customerMap = new Map(customers.map(c => [c.id, c]));

    // Derive customer name, preferring metadata then Customer
    const mapped = rows.map((r: any) => {
      const meta = (r?.metadata || {}) as any;
      const productName = r.productId ? (productMap.get(String(r.productId)) || r.productId) : (meta?.productName || 'Subscription');
      const fallbackCustomer = customerMap.get(String(r.customerId || '')) as any;
      const customerName = meta?.buyerName || fallbackCustomer?.name || '-';
      const customerEmail = meta?.buyerEmail || fallbackCustomer?.email || null;
      let interval = meta?.interval || null as any;
      let intervalCount = meta?.intervalCount || null as any;
      if (!interval && r.currentPeriodStart && r.currentPeriodEnd) {
        const start = new Date(r.currentPeriodStart as any).getTime();
        const end = new Date(r.currentPeriodEnd as any).getTime();
        const days = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));
        if (days >= 360) { interval = 'year'; intervalCount = 1; }
        else if (days >= 28 && days <= 31) { interval = 'month'; intervalCount = 1; }
        else if (days >= 6 && days <= 8) { interval = 'week'; intervalCount = 1; }
        else if (days <= 1) { interval = 'day'; intervalCount = 1; }
      }
      return {
        id: r.providerSubscriptionId || r.id,
        internalId: r.id,
        provider: r.provider || null,
        status: r.status,
        customerName,
        customerEmail,
        product: productName,
        startedAt: r.startAt || null,
        updatedAt: r.updatedAt || r.currentPeriodStart || null,
        interval,
        intervalCount,
      };
    });

    const payload = { data: mapped, pagination: { page, page_size: pageSize, total } };

    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
    console.error('[GET /api/subscriptions] Error:', e?.message || e);
    return NextResponse.json({ error: e?.message || 'Failed to list subscriptions' }, { status: 500 });
  }
}
