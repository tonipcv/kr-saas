import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const name = String(body.name || '').trim();
    const minPoints = Number(body.minPoints ?? 0) || 0;
    const isActive = Boolean(body.isActive ?? true);
    const slug = body.slug ? String(body.slug).trim() : undefined;

    if (!name) return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });

    const updated = await prisma.membershipLevelTemplate.update({
      where: { id: params.id },
      data: { 
        name, 
        minPoints, 
        isActive, 
        slug: slug && slug.length > 0 ? slug : null 
      },
    });

    return NextResponse.json({ template: updated });
  } catch (e: any) {
    console.error('[membership/templates/[id]][PUT] error', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    await prisma.membershipLevelTemplate.delete({
      where: { id: params.id },
    });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('[membership/templates/[id]][DELETE] error', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}

// Endpoint para aplicar um template a uma clínica específica
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const clinicId = body.clinicId;

    if (!clinicId) {
      return NextResponse.json({ error: 'clinicId é obrigatório' }, { status: 400 });
    }

    // Get template
    const template = await prisma.membershipLevelTemplate.findUnique({
      where: { id: params.id }
    });

    if (!template) {
      return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 });
    }

    // Create membership level from template
    const created = await prisma.membershipLevel.create({
      data: {
        name: template.name,
        slug: template.slug ? `${template.slug}-${clinicId}` : null,
        minPoints: template.minPoints,
        isActive: template.isActive,
        clinicId
      }
    });

    return NextResponse.json({ level: created });
  } catch (e: any) {
    console.error('[membership/templates/[id]][POST] error', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}
