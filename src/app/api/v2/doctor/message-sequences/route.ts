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

export async function GET(request: NextRequest) {
  try {
    const doctorId = await authDoctor(request);
    if (!doctorId) return unauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const search = searchParams.get('search')?.toLowerCase() || '';

    const where: any = { doctorId };
    if (search) where.name = { contains: search, mode: 'insensitive' };

    const [rows, total] = await Promise.all([
      prisma.messageSequence.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { steps: { orderBy: { orderIndex: 'asc' }, include: { template: { select: { name: true, channel: true } } } } },
        skip: offset,
        take: limit,
      }),
      prisma.messageSequence.count({ where }),
    ]);

    return NextResponse.json({ success: true, data: rows, pagination: { total, limit, offset, hasMore: offset + limit < total } });
  } catch (error) {
    console.error('GET /api/v2/doctor/message-sequences error', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const doctorId = await authDoctor(request);
    if (!doctorId) return unauthorizedResponse();

    const body = await request.json();
    const { name, description, steps } = body || {};
    if (!name) return NextResponse.json({ success: false, error: 'name is required' }, { status: 400 });

    const dup = await prisma.messageSequence.findFirst({ where: { doctorId, name } });
    if (dup) return NextResponse.json({ success: false, error: 'Sequence name already exists' }, { status: 409 });

    const created = await prisma.messageSequence.create({
      data: {
        doctorId,
        name,
        description: description ?? null,
        steps: Array.isArray(steps) && steps.length > 0 ? {
          create: steps.map((s: any, idx: number) => ({
            orderIndex: s.orderIndex ?? idx,
            delayAmount: s.delayAmount ?? 0,
            delayUnit: s.delayUnit ?? 'hours',
            templateId: s.templateId,
          })),
        } : undefined,
      },
      include: { steps: true },
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    console.error('POST /api/v2/doctor/message-sequences error', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
