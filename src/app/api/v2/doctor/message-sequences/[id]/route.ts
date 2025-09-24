import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { verifyMobileAuth, unauthorizedResponse } from '@/lib/mobile-auth';

async function authDoctor(request: NextRequest) {
  let userId: string | null = null;
  let userRole: string | null = null;
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    userId = session.user.id;
    const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    userRole = dbUser?.role || null;
  } else {
    const mobileUser = await verifyMobileAuth(request);
    if (mobileUser?.id) {
      userId = mobileUser.id;
      userRole = mobileUser.role;
    }
  }
  if (!userId || userRole !== 'DOCTOR') return null;
  return userId;
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const doctorId = await authDoctor(request);
    if (!doctorId) return unauthorizedResponse();
    const id = params.id;

    const row = await prisma.messageSequence.findFirst({
      where: { id, doctorId },
      include: { steps: { orderBy: { orderIndex: 'asc' }, include: { template: { select: { name: true, channel: true } } } } },
    });
    if (!row) return NextResponse.json({ success: false, error: 'Sequence not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: row });
  } catch (error) {
    console.error('GET /api/v2/doctor/message-sequences/[id] error', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const doctorId = await authDoctor(request);
    if (!doctorId) return unauthorizedResponse();
    const id = params.id;
    const body = await request.json();

    const exists = await prisma.messageSequence.findFirst({ where: { id, doctorId } });
    if (!exists) return NextResponse.json({ success: false, error: 'Sequence not found' }, { status: 404 });

    const { name, description, steps } = body || {};

    const updated = await prisma.messageSequence.update({
      where: { id },
      data: {
        name: name ?? undefined,
        description: description ?? undefined,
      },
    });

    if (Array.isArray(steps)) {
      // Replace steps (simple approach)
      await prisma.$transaction([
        prisma.messageSequenceStep.deleteMany({ where: { sequenceId: id } }),
        prisma.messageSequenceStep.createMany({
          data: steps.map((s: any, idx: number) => ({
            sequenceId: id,
            orderIndex: s.orderIndex ?? idx,
            delayAmount: s.delayAmount ?? 0,
            delayUnit: s.delayUnit ?? 'hours',
            templateId: s.templateId,
          })),
        }),
      ]);
    }

    const fresh = await prisma.messageSequence.findFirst({ where: { id, doctorId }, include: { steps: { orderBy: { orderIndex: 'asc' } } } });
    return NextResponse.json({ success: true, data: fresh });
  } catch (error) {
    console.error('PATCH /api/v2/doctor/message-sequences/[id] error', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const doctorId = await authDoctor(request);
    if (!doctorId) return unauthorizedResponse();
    const id = params.id;

    const exists = await prisma.messageSequence.findFirst({ where: { id, doctorId } });
    if (!exists) return NextResponse.json({ success: false, error: 'Sequence not found' }, { status: 404 });

    await prisma.messageSequence.delete({ where: { id } });
    return NextResponse.json({ success: true, data: { id }, message: 'Sequence deleted' });
  } catch (error) {
    console.error('DELETE /api/v2/doctor/message-sequences/[id] error', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
