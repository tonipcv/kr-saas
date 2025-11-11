import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is super admin
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true }
    });

    if (user?.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Fetch only doctors (only doctors can have this access flag)
    const rows = await prisma.user.findMany({
      where: {
        role: 'DOCTOR'
      },
      orderBy: {
        name: 'asc'
      }
    });

    const users = rows.map((u: any) => ({
      id: u.id,
      name: u.name ?? null,
      email: u.email ?? null,
      role: u.role,
      accessGranted: Boolean(u.accessGranted)
    }));

    return NextResponse.json({
      users,
      total: users.length
    });

  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 