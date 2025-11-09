import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/v2/oauth/state-meta?state=...
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const state = url.searchParams.get('state');
    if (!state) {
      return NextResponse.json({ error: 'Missing state' }, { status: 400 });
    }
    const meta = await prisma.oAuthStateMeta.findUnique({
      where: { state },
      select: {
        state: true,
        organisationId: true,
        authorisationServerId: true,
        productId: true,
        amountCents: true,
        currency: true,
        orderRef: true,
        createdAt: true,
      },
    });
    if (!meta) {
      return NextResponse.json({ error: 'State not found' }, { status: 404 });
    }
    return NextResponse.json(meta);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
