import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

function isEnabled() { return true; }

function safeStr(v: any) { return typeof v === 'string' ? v : (v == null ? null : String(v)); }

const allowed = new Set(['started','pix_generated','paid','abandoned','canceled']);

export async function POST(req: Request) {
  try {
    if (!isEnabled()) return NextResponse.json({ error: 'disabled' }, { status: 200 });
    const body = await req.json().catch(() => ({}));
    const resumeToken = safeStr(body.resumeToken);
    const status = safeStr(body.status);
    if (!resumeToken || !status || !allowed.has(status)) return NextResponse.json({ error: 'invalid_params' }, { status: 400 });

    const orderId = safeStr(body.orderId) || undefined;
    const pixOrderId = safeStr(body.pixOrderId) || undefined;
    const pixExpiresAt = body.pixExpiresAt ? new Date(body.pixExpiresAt) : undefined;
    const paymentTransactionId = safeStr(body.paymentTransactionId) || undefined;

    const sess = await prisma.checkoutSession.findUnique({ where: { resumeToken }, select: { id: true, status: true } });
    if (!sess) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    // Transition rules: avoid downgrades from paid
    const current = sess.status as string;
    if (current === 'paid' && status !== 'paid') {
      return NextResponse.json({ error: 'immutable_paid' }, { status: 400 });
    }

    // If trying to abandon an already paid or canceled session, reject
    if ((current === 'paid' || current === 'canceled') && status === 'abandoned') {
      return NextResponse.json({ error: 'invalid_transition' }, { status: 400 });
    }

    const updated = await prisma.checkoutSession.update({
      where: { resumeToken },
      data: {
        status: status as any,
        orderId,
        pixOrderId,
        pixExpiresAt,
        paymentTransactionId,
      },
      select: { id: true, status: true }
    });

    return NextResponse.json({ success: true, id: updated.id, status: updated.status });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'internal_error' }, { status: 500 });
  }
}
