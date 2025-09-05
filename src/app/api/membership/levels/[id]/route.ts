import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function PUT(req: Request, { params }: { params: { id: string } }) {
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

    // Verificar se o nível pertence a esta clínica
    const level = await prisma.membershipLevel.findFirst({
      where: {
        id: params.id,
        clinic_id: clinic.id
      }
    });

    if (!level) {
      return NextResponse.json({ error: 'Nível não encontrado' }, { status: 404 });
    }

    // Check if slug is unique for this clinic
    if (slug && slug !== level.slug) {
      const existing = await prisma.membershipLevel.findFirst({
        where: {
          clinic_id: clinic.id,
          slug,
          id: { not: params.id }
        }
      });

      if (existing) {
        return NextResponse.json({ error: 'Já existe um nível com este slug nesta clínica' }, { status: 400 });
      }
    }

    const updated = await prisma.membershipLevel.update({
      where: { id: params.id },
      data: {
        name,
        minPoints,
        isActive,
        slug: slug && slug.length > 0 ? slug : null
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

    return NextResponse.json({ level: updated });
  } catch (e: any) {
    console.error('[membership/levels/[id]][PUT] error', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
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

    // Verificar se o nível pertence a esta clínica
    const level = await prisma.membershipLevel.findFirst({
      where: {
        id: params.id,
        clinic_id: clinic.id
      }
    });

    if (!level) {
      return NextResponse.json({ error: 'Nível não encontrado' }, { status: 404 });
    }

    await prisma.membershipLevel.delete({
      where: { id: params.id }
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('[membership/levels/[id]][DELETE] error', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}