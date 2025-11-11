import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only SUPER_ADMIN can change access
    const me = await prisma.user.findUnique({ where: { email: session.user.email }, select: { role: true } });
    if (me?.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { id } = params;
    const body = await request.json().catch(() => ({}));
    const desired: boolean | undefined = typeof body?.accessGranted === 'boolean' ? body.accessGranted : undefined;
    if (typeof desired !== 'boolean') {
      return NextResponse.json({ error: 'accessGranted boolean required' }, { status: 400 });
    }

    // Only Doctors should be toggled
    const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (target.role !== 'DOCTOR') return NextResponse.json({ error: 'Only doctors can be updated' }, { status: 400 });

    const updated = await prisma.user.update({ where: { id }, data: ({ accessGranted: desired } as any) });

    return NextResponse.json({ id: updated.id, accessGranted: (updated as any).accessGranted === true });
  } catch (err) {
    console.error('Error updating accessGranted:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
