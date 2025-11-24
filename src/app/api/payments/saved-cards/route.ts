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
      `SELECT cpm.id,
              cpm.customer_id as customer_id,
              CASE WHEN cpm.provider = 'PAGARME' THEN 'KRXPAY' ELSE cpm.provider END as provider,
              cpm.account_id as account_id,
              cpm.provider_payment_method_id as provider_payment_method_id,
              cpm.brand,
              cpm.last4,
              cpm.exp_month,
              cpm.exp_year,
              cpm.is_default,
              cpm.status,
              cpm.created_at,
              cp.provider_customer_id as provider_customer_id
         FROM customer_payment_methods cpm
         LEFT JOIN customer_providers cp ON cp.id = cpm.customer_provider_id
        WHERE cpm.customer_id = $1
          AND cpm.status = 'ACTIVE'
          AND cpm.provider IN ('KRXPAY', 'PAGARME', 'STRIPE', 'APPMAX')
        ORDER BY cpm.is_default DESC, cpm.created_at DESC
        LIMIT 50`,
      String(customer.id)
    );

    return NextResponse.json({ ok: true, data: methods });
  } catch (e: any) {
    console.error('[saved-cards] error', e);
    return NextResponse.json({ ok: false, error: e?.message || 'Internal error' }, { status: 500 });
  }
}
