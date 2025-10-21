import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const offers = await prisma.offer.findMany({
      where: { productId: String(id) },
      orderBy: { createdAt: 'asc' },
      include: { paymentMethods: true },
    });
    return NextResponse.json({ offers });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to list offers' }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const data: any = {
      productId: String(id),
      name: String(body?.name || 'Nova oferta'),
      description: body?.description || undefined,
      currency: body?.currency || 'BRL',
      priceCents: Number(body?.priceCents || 0),
      maxInstallments: body?.maxInstallments != null ? Number(body.maxInstallments) : 1,
      installmentMinCents: body?.installmentMinCents != null ? Number(body.installmentMinCents) : null,
      active: body?.active != null ? Boolean(body.active) : true,
      isSubscription: Boolean(body?.isSubscription || false),
      intervalCount: body?.intervalCount != null ? Number(body.intervalCount) : null,
      intervalUnit: body?.intervalUnit || null,
      trialDays: body?.trialDays != null ? Number(body.trialDays) : null,
      checkoutUrl: body?.checkoutUrl || undefined,
    };
    const offer = await prisma.offer.create({ data });
    return NextResponse.json({ offer });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to create offer' }, { status: 500 });
  }
}
