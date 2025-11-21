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
    // Enforce product type constraints: if product is SUBSCRIPTION, offer must be subscription
    const product = await prisma.product.findUnique({ where: { id: String(id) }, select: { type: true } });
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    if (String(product.type) === 'SUBSCRIPTION' && body?.isSubscription === false) {
      return NextResponse.json({ error: 'Offers for subscription products must be subscription (isSubscription=true)' }, { status: 400 });
    }
    const data: any = {
      productId: String(id),
      name: String(body?.name || 'Nova oferta'),
      description: body?.description || undefined,
      currency: body?.currency || 'BRL',
      // Keep schema compatibility: Offer no longer carries pricing here
      priceCents: 0,
      active: body?.active != null ? Boolean(body.active) : true,
      isSubscription: String(product.type) === 'SUBSCRIPTION' ? true : Boolean(body?.isSubscription || false),
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
