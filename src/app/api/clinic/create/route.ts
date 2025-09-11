import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ClinicRole } from '@prisma/client';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, subdomain } = await req.json();
    const clinicName = (name || '').toString().trim();
    const rawSub = (subdomain || '').toString().trim().toLowerCase();

    if (!clinicName) {
      return NextResponse.json({ error: 'Nome do negócio é obrigatório' }, { status: 400 });
    }

    if (rawSub && !/^[a-z0-9-]{3,63}$/.test(rawSub)) {
      return NextResponse.json({ error: 'Subdomínio inválido' }, { status: 400 });
    }

    // Ensure subdomain is unique if provided
    if (rawSub) {
      const conflict = await prisma.clinic.findFirst({
        where: { OR: [{ subdomain: rawSub }, { slug: rawSub }] },
        select: { id: true },
      });
      if (conflict) {
        return NextResponse.json({ error: 'Subdomínio já está em uso' }, { status: 400 });
      }
    }

    // Create clinic owned by the current user
    const created = await prisma.clinic.create({
      data: {
        name: clinicName,
        ownerId: session.user.id,
        isActive: true,
        subdomain: rawSub || null,
      },
      select: { id: true, name: true, subdomain: true },
    });

    // Ensure owner membership exists
    try {
      await prisma.clinicMember.create({
        data: {
          clinicId: created.id,
          userId: session.user.id,
          role: ClinicRole.OWNER,
          isActive: true,
        },
      });
    } catch (e) {
      // ignore duplicates
    }

    return NextResponse.json({ clinic: created });
  } catch (error: any) {
    console.error('Create clinic draft error:', error?.message);
    return NextResponse.json({ error: 'Failed to create clinic' }, { status: 500 });
  }
}
