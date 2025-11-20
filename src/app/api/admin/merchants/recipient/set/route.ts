import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { pagarmeGetRecipient } from '@/lib/payments/pagarme/sdk';

// POST /api/admin/merchants/recipient/set
// Body: { clinicId: string, recipientId: string, splitPercent?: number, platformFeeBps?: number, verify?: boolean }
// SUPER_ADMIN-only: sets Merchant.recipientId for a clinic. Optionally verifies existence at provider.
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { role: true } });
    if (user?.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { clinicId, recipientId, splitPercent, platformFeeBps, verify } = await req.json();
    if (!clinicId) return NextResponse.json({ error: 'clinicId is required' }, { status: 400 });
    if (!recipientId) return NextResponse.json({ error: 'recipientId is required' }, { status: 400 });

    const rid = String(recipientId).trim();
    if (!/^re_[A-Za-z0-9]+$/.test(rid)) {
      return NextResponse.json({ error: 'Invalid recipientId. Expect v5 ID starting with re_' }, { status: 400 });
    }

    // Optional provider verification
    let provider: any = null;
    if (verify !== false) {
      try {
        provider = await pagarmeGetRecipient(rid);
      } catch (e: any) {
        return NextResponse.json({ error: 'Recipient not found at provider (check env/account and ID)' }, { status: 404 });
      }
    }

    // Ensure merchant row exists
    await prisma.merchant.upsert({
      where: { clinicId },
      update: {},
      create: { clinicId, status: 'PENDING' },
      select: { id: true },
    });

    const updated = await prisma.merchant.update({
      where: { clinicId },
      data: {
        recipientId: rid,
        splitPercent: typeof splitPercent === 'number' ? splitPercent : undefined,
        platformFeeBps: typeof platformFeeBps === 'number' ? platformFeeBps : undefined,
        status: 'ACTIVE',
        lastSyncAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true, merchant: updated, provider });
  } catch (e: any) {
    console.error('[admin][recipient.set] error', e?.message || e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}
