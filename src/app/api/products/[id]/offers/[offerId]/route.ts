import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string, offerId: string }> }) {
  try {
    const { id, offerId } = await params;
    const body = await req.json();
    const data: any = {
      name: body?.name,
      description: body?.description ?? undefined,
      currency: body?.currency ?? undefined,
      priceCents: body?.priceCents != null ? Number(body.priceCents) : undefined,
      maxInstallments: body?.maxInstallments != null ? Number(body.maxInstallments) : undefined,
      installmentMinCents: body?.installmentMinCents != null ? Number(body.installmentMinCents) : undefined,
      active: body?.active != null ? Boolean(body.active) : undefined,
      isSubscription: body?.isSubscription != null ? Boolean(body.isSubscription) : undefined,
      intervalCount: body?.intervalCount != null ? Number(body.intervalCount) : undefined,
      intervalUnit: body?.intervalUnit ?? undefined,
      trialDays: body?.trialDays != null ? Number(body.trialDays) : undefined,
      checkoutUrl: body?.checkoutUrl ?? undefined,
    };
    const offer = await prisma.offer.update({ where: { id: String(offerId) }, data });
    if (offer.productId !== id) return NextResponse.json({ error: 'Offer does not belong to product' }, { status: 400 });
    return NextResponse.json({ offer });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to update offer' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string, offerId: string }> }) {
  try {
    const { id, offerId } = await params;
    const offer = await prisma.offer.delete({ where: { id: String(offerId) } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to delete offer' }, { status: 500 });
  }
}
