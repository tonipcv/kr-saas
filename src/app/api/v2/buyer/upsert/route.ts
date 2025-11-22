import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { openFinancePersistEnabled } from '@/lib/config';

export async function POST(req: NextRequest) {
  try {
    if (!openFinancePersistEnabled) {
      return NextResponse.json({ ok: true, skipped: true }, { status: 200 });
    }

    const body = await req.json();
    const {
      clinicId,
      userId,
      email,
      document,
      fullName,
      phones,
    } = body ?? {};

    if (!clinicId) return NextResponse.json({ error: 'clinicId required' }, { status: 400 });
    if (!email && !document && !userId) return NextResponse.json({ error: 'one of email, document, userId required' }, { status: 400 });

    const docDigits = typeof document === 'string' ? document.replace(/\D/g, '') : null;
    const primaryEmail = typeof email === 'string' ? email : null;
    const primaryName = typeof fullName === 'string' ? fullName : null;
    const primaryPhone = Array.isArray(phones) && phones.length > 0 ? String(phones[0]) : null;

    const merchant = await prisma.merchant.findFirst({ where: { clinicId: String(clinicId) }, select: { id: true } });
    if (!merchant?.id) return NextResponse.json({ error: 'merchant not found for clinic' }, { status: 404 });

    // Upsert unified Customer by merchant + email (preferred) or document
    let where: any = null;
    if (primaryEmail) where = { merchantId: String(merchant.id), email: primaryEmail };
    else if (docDigits) where = { merchantId: String(merchant.id), document: docDigits };
    else return NextResponse.json({ error: 'email or document required for unified customer' }, { status: 400 });

    const existing = await prisma.customer.findFirst({ where, select: { id: true } });
    if (existing?.id) {
      await prisma.customer.update({
        where: { id: existing.id },
        data: {
          email: primaryEmail || undefined,
          document: docDigits || undefined,
          name: primaryName || undefined,
          phone: primaryPhone || undefined,
          metadata: { source: 'v2_buyer_upsert' } as any,
        } as any,
      } as any);
      return NextResponse.json({ ok: true, updated: true }, { status: 200 });
    }

    await prisma.customer.create({
      data: {
        merchantId: String(merchant.id),
        email: primaryEmail,
        document: docDigits,
        name: primaryName,
        phone: primaryPhone,
        metadata: { source: 'v2_buyer_upsert', userId: userId || null } as any,
      } as any,
    } as any);
    return NextResponse.json({ ok: true, created: true }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'unexpected error' }, { status: 500 });
  }
}
