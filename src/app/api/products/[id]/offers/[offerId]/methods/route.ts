import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PaymentMethod } from '@prisma/client';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string, offerId: string }> }) {
  try {
    const { id, offerId } = await params;
    const body = await req.json();
    const methods: Array<{ method: PaymentMethod | string; active: boolean }> = Array.isArray(body?.methods) ? body.methods : [];

    // Ensure offer exists and belongs to product
    const offer = await prisma.offer.findUnique({ where: { id: String(offerId) }, select: { id: true, productId: true } });
    if (!offer || offer.productId !== id) return NextResponse.json({ error: 'Offer not found for this product' }, { status: 404 });

    // Upsert methods
    for (const m of methods) {
      const method = (typeof m.method === 'string' ? m.method : String(m.method)).toUpperCase() as PaymentMethod;
      const active = !!m.active;
      await prisma.offerPaymentMethod.upsert({
        where: { offerId_method: { offerId: offer.id, method } },
        update: { active },
        create: { offerId: offer.id, method, active },
      });
    }

    const updated = await prisma.offer.findUnique({ where: { id: offer.id }, include: { paymentMethods: true } });
    return NextResponse.json({ offer: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to update payment methods' }, { status: 500 });
  }
}
