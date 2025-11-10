import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function isEnabled() { return true; }

function safeStr(v: any) { return typeof v === 'string' ? v : (v == null ? null : String(v)); }

export async function POST(req: Request) {
  try {
    if (!isEnabled()) return NextResponse.json({ error: 'disabled' }, { status: 200 });
    const body = await req.json().catch(() => ({}));
    const resumeToken = safeStr(body.resumeToken);
    const lastStep = safeStr(body.lastStep) || null;
    if (!resumeToken) return NextResponse.json({ error: 'resumeToken required' }, { status: 400 });

    const sess = await prisma.checkoutSession.update({
      where: { resumeToken },
      data: { lastHeartbeatAt: new Date(), lastStep: lastStep ?? undefined },
      select: { id: true }
    }).catch(() => null);

    if (!sess) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'internal_error' }, { status: 500 });
  }
}
