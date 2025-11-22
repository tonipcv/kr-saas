import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/payments/saved-cards?userId=...&slug=...
// Unified: Lists saved cards from customer_payment_methods for the unified Customer (merchant + email)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const slug = searchParams.get('slug');

    if (!userId || !slug) {
      return NextResponse.json({ ok: false, error: 'userId and slug are required' }, { status: 400 });
    }

    // Resolve clinic by slug and merchant for this business
    const clinic = await prisma.clinic.findFirst({ where: { slug }, select: { id: true } });
    if (!clinic?.id) {
      return NextResponse.json({ ok: false, error: 'Business (clinic) not found' }, { status: 404 });
    }
    const merchant = await prisma.merchant.findFirst({ where: { clinicId: String(clinic.id) }, select: { id: true } });
    if (!merchant?.id) return NextResponse.json({ ok: true, data: [] });

    // Resolve user email to find unified Customer
    const user = await prisma.user.findUnique({ where: { id: String(userId) }, select: { email: true } });
    const email = user?.email || null;
    if (!email) return NextResponse.json({ ok: true, data: [] });

    const customer = await prisma.customer.findFirst({ where: { merchantId: String(merchant.id), email }, select: { id: true } });
    if (!customer?.id) return NextResponse.json({ ok: true, data: [] });

    const methods = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id,
              customer_id as customer_id,
              provider,
              account_id as account_id,
              provider_payment_method_id as provider_payment_method_id,
              brand,
              last4,
              exp_month,
              exp_year,
              is_default,
              status,
              created_at
         FROM customer_payment_methods
        WHERE customer_id = $1
        ORDER BY is_default DESC, created_at DESC
        LIMIT 50`,
      String(customer.id)
    );

    return NextResponse.json({ ok: true, data: methods });
  } catch (e: any) {
    console.error('[saved-cards] error', e);
    return NextResponse.json({ ok: false, error: e?.message || 'Internal error' }, { status: 500 });
  }
}
