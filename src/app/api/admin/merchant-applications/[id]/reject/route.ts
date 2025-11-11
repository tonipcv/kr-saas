import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { MerchantOnboardingService } from '@/services/merchant-onboarding';

function isAdmin(role?: string | null) {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

const service = new MerchantOnboardingService();

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
    if (!isAdmin(me?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const appId = params.id;
    if (!appId) return NextResponse.json({ error: 'application id is required' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const reviewNotes: string | undefined = body?.reviewNotes;

    const result = await service.rejectApplication({ applicationId: appId, reviewedBy: session.user.id, reviewNotes });
    return NextResponse.json({ success: true, status: result.status });
  } catch (error: any) {
    console.error('[admin/merchant-applications/reject][POST] error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
