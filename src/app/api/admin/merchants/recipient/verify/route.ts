import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { pagarmeGetRecipient } from '@/lib/pagarme';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true },
    });
    if (user?.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const recipientIdParam = searchParams.get('recipientId')?.trim();
    const clinicId = searchParams.get('clinicId')?.trim();

    let recipientId: string | null = recipientIdParam || null;

    if (!recipientId && clinicId) {
      const merchant = await prisma.merchant.findUnique({ where: { clinicId } });
      recipientId = merchant?.recipientId || null;
      if (!recipientId) {
        return NextResponse.json({ error: 'Clinic has no recipientId' }, { status: 404 });
      }
    }

    if (!recipientId) {
      return NextResponse.json({ error: 'Provide recipientId or clinicId' }, { status: 400 });
    }

    const data = await pagarmeGetRecipient(recipientId);

    // Extract a concise status summary for quick troubleshooting
    const summary = {
      id: data?.id ?? null,
      status: data?.status ?? data?.metadata?.status ?? null,
      transfer_enabled: data?.transfer_enabled ?? data?.transferSettings?.transfer_enabled ?? null,
      anticipatable_volume_percentage: data?.anticipatable_volume_percentage ?? data?.automatic_anticipation?.percentage ?? null,
      type: data?.type ?? null,
      created_at: data?.date_created ?? data?.created_at ?? null,
      bank_account: data?.default_bank_account || data?.bank_account || null,
    };

    return NextResponse.json({ recipientId, summary, raw: data });
  } catch (error: any) {
    console.error('Error verifying recipient:', error?.message || error);
    return NextResponse.json({ error: 'Failed to verify recipient' }, { status: 500 });
  }
}
