import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const templates = await prisma.membershipLevelTemplate.findMany({
      orderBy: { minPoints: 'asc' },
    });
    return NextResponse.json({ templates });
  } catch (e: any) {
    console.error('[membership/templates][GET] error', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = String(body.name || '').trim();
    const minPoints = Number(body.minPoints ?? 0) || 0;
    const isActive = Boolean(body.isActive ?? true);
    const slug = body.slug ? String(body.slug).trim() : undefined;

    if (!name) return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });

    const created = await prisma.membershipLevelTemplate.create({
      data: { 
        name, 
        minPoints, 
        isActive, 
        slug: slug && slug.length > 0 ? slug : null 
      },
    });

    return NextResponse.json({ template: created });
  } catch (e: any) {
    console.error('[membership/templates][POST] error', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}
