import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { pagarmeListSubscriptions } from '@/lib/pagarme';

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

    // Fetch subscriptions from Pagar.me (v5)
    // Common params: page, size, created_since/created_until
    const params: Record<string, any> = {};
    if (page > 0) params.page = page;
    if (pageSize > 0) params.size = pageSize;
    if (from) params.created_since = from;
    if (to) params.created_until = to;

    const apiResp: any = await pagarmeListSubscriptions(params);
    // Pagar.me may return an array or a paginated object; normalize to array
    const itemsRaw: any[] = Array.isArray(apiResp) ? apiResp : (apiResp?.data || apiResp?.items || []);

    // Filter by our metadata.clinicId (set on create/subscribe)
    const filtered = itemsRaw.filter((s: any) => {
      const meta = s?.metadata || {};
      return String(meta?.clinicId || '') === String(clinicId);
    });

    // Collect productIds to enrich with our product name
    const productIds = Array.from(new Set(filtered.map((s: any) => String(s?.metadata?.productId || '')).filter(Boolean)));
    const products = productIds.length > 0 ? await prisma.products.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true },
    }) : [];
    const productMap = new Map(products.map(p => [p.id, p.name]));

    // Map to UI-friendly shape
    const mapped = filtered.map((s: any) => {
      const meta = s?.metadata || {};
      const customer = s?.customer || s?.customer_data || {};
      const plan = s?.plan || s?.plan_data || {};
      const items = s?.items || [];
      // Try to infer cycle
      const interval = (s?.billing_interval || plan?.interval || (s?.interval as any)) || null;
      const intervalCount = (s?.billing_interval_count || plan?.interval_count || (s?.interval_count as any)) || null;
      // Charges info (depends on API)
      const chargesCount = Array.isArray(s?.charges) ? s.charges.length : (typeof s?.charges_count === 'number' ? s.charges_count : 0);

      const productId = String(meta?.productId || '');
      const productName = productId ? (productMap.get(productId) || productId) : (items?.[0]?.name || plan?.name || 'Subscription');

      return {
        id: s?.id || s?.code || '',
        status: s?.status || s?.payment_status || 'unknown',
        customerName: customer?.name || customer?.email || meta?.buyerEmail || '-',
        product: productName,
        startedAt: s?.created_at || s?.start_at || s?.start_date || null,
        updatedAt: s?.updated_at || s?.updated_at || null,
        chargesCount,
        interval,
        intervalCount,
      };
    });

    const payload = {
      data: mapped,
      pagination: {
        page,
        page_size: pageSize,
        total: mapped.length, // we don't know remote total; return current page size
      },
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
    console.error('[GET /api/subscriptions] Error:', e?.message || e);
    return NextResponse.json({ error: e?.message || 'Failed to list subscriptions' }, { status: 500 });
  }
}
