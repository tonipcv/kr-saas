import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/payments/saved-cards?userId=...&slug=...
// Lists saved cards (payment_methods) for a patient user within a business (clinic owner resolved by slug)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const slug = searchParams.get('slug');

    if (!userId || !slug) {
      return NextResponse.json({ ok: false, error: 'userId and slug are required' }, { status: 400 });
    }

    // Resolve clinic by slug (scope payments to this business)
    const clinic = await prisma.clinic.findFirst({ where: { slug }, select: { id: true } });
    if (!clinic?.id) {
      return NextResponse.json({ ok: false, error: 'Business (clinic) not found' }, { status: 404 });
    }
    // Collect ALL patient profiles for this user (across staff/doctors)
    const profiles = await prisma.patientProfile.findMany({ where: { userId }, select: { id: true } });
    if (!profiles.length) return NextResponse.json({ ok: true, data: [] });
    const profileIds = profiles.map(p => p.id);

    // List payment customers for these profiles, restricted to this clinic
    let customers = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, provider, provider_customer_id, created_at
         FROM payment_customers
        WHERE patient_profile_id = ANY($1)
          AND clinic_id = $2
        ORDER BY created_at DESC
        LIMIT 25`,
      profileIds,
      clinic.id
    );

    // Fallback: if none for this clinic, return latest across any clinic
    if (customers.length === 0) {
      customers = await prisma.$queryRawUnsafe<any[]>(
        `SELECT id, provider, provider_customer_id, created_at
           FROM payment_customers
          WHERE patient_profile_id = ANY($1)
          ORDER BY created_at DESC
          LIMIT 25`,
        profileIds
      );
    }

    const customerIds = customers.map(c => c.id);
    if (customerIds.length === 0) {
      return NextResponse.json({ ok: true, data: [] });
    }

    // List payment methods for those customers
    const methods = await prisma.$queryRawUnsafe<any[]>(
      `SELECT pm.id,
              pm.payment_customer_id,
              pm.provider_card_id,
              pm.brand,
              pm.last4,
              pm.exp_month,
              pm.exp_year,
              pm.is_default,
              pm.status,
              pm.created_at
         FROM payment_methods pm
        WHERE pm.payment_customer_id = ANY($1)
        ORDER BY pm.is_default DESC, pm.created_at DESC
        LIMIT 50`,
      customerIds
    );

    // join provider_customer_id for convenience
    const byId: Record<string, string> = Object.fromEntries(customers.map(c => [c.id, c.provider_customer_id]));
    const data = methods.map(m => ({
      id: m.id,
      payment_customer_id: m.payment_customer_id,
      provider_customer_id: byId[m.payment_customer_id] || null,
      provider_card_id: m.provider_card_id,
      brand: m.brand,
      last4: m.last4,
      exp_month: m.exp_month,
      exp_year: m.exp_year,
      is_default: m.is_default,
      status: m.status,
      created_at: m.created_at,
    }));

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    console.error('[saved-cards] error', e);
    return NextResponse.json({ ok: false, error: e?.message || 'Internal error' }, { status: 500 });
  }
}
