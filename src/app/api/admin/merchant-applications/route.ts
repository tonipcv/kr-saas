import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function isAdmin(role?: string | null) {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
    if (!isAdmin(me?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || undefined;
    const type = searchParams.get('type') || undefined;
    const from = searchParams.get('from') ? new Date(String(searchParams.get('from'))) : undefined;
    const to = searchParams.get('to') ? new Date(String(searchParams.get('to'))) : undefined;
    const take = Math.min(parseInt(String(searchParams.get('take') || '50')), 200);
    const skip = Math.max(parseInt(String(searchParams.get('skip') || '0')), 0);

    const where: any = {};
    if (status) where.status = status as any;
    if (type) where.type = type as any;
    if (from || to) where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };

    const [items, total] = await Promise.all([
      prisma.merchantApplication.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          clinic: { select: { id: true, name: true, ownerId: true } },
        },
        take,
        skip,
      }),
      prisma.merchantApplication.count({ where }),
    ]);

    return NextResponse.json({ total, items });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
