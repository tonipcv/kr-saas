import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Buscar a clínica do médico
    const clinic = await prisma.clinic.findFirst({
      where: {
        ownerId: session.user.id,
        isActive: true,
      },
      select: { id: true }
    });

    if (!clinic) {
      return NextResponse.json({ error: 'Nenhuma clínica encontrada' }, { status: 404 });
    }

    const levels = await prisma.membershipLevel.findMany({
      where: { clinic_id: clinic.id },
      orderBy: { minPoints: 'asc' },
      include: {
        clinic: {
          select: {
            name: true,
            slug: true
          }
        }
      }
    });
    return NextResponse.json({ levels });
  } catch (e: any) {
    console.error('[membership/levels][GET] error', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Buscar a clínica do médico
    const clinic = await prisma.clinic.findFirst({
      where: {
        ownerId: session.user.id,
        isActive: true,
      },
      select: { id: true }
    });

    if (!clinic) {
      return NextResponse.json({ error: 'Nenhuma clínica encontrada' }, { status: 404 });
    }

    const body = await req.json();
    const name = String(body.name || '').trim();
    const minPoints = Number(body.minPoints ?? 0) || 0;
    const isActive = Boolean(body.isActive ?? true);
    const slug = body.slug ? String(body.slug).trim() : undefined;

    if (!name) return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });

    // Check if slug is unique for this clinic
    if (slug) {
      const existing = await prisma.membershipLevel.findFirst({
        where: {
          clinic_id: clinic.id,
          slug,
        }
      });

      if (existing) {
        return NextResponse.json({ error: 'Já existe um nível com este slug nesta clínica' }, { status: 400 });
      }
    }

    const created = await prisma.membershipLevel.create({
      data: {
        name,
        minPoints,
        isActive,
        slug: slug && slug.length > 0 ? slug : null,
        clinic_id: clinic.id
      },
      include: {
        clinic: {
          select: {
            name: true,
            slug: true
          }
        }
      }
    });
    return NextResponse.json({ level: created });
  } catch (e: any) {
    console.error('[membership/levels][POST] error', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}