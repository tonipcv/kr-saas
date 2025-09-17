import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const querySchema = z.object({
  clinicId: z.string().min(1),
  limit: z.coerce.number().min(1).max(200).default(50),
  types: z.string().optional(), // CSV of types (strings)
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      clinicId: searchParams.get('clinicId'),
      limit: searchParams.get('limit') || undefined,
      types: searchParams.get('types') || undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query', details: parsed.error.flatten() }, { status: 400 });
    }
    const q = parsed.data;
    const typesList = q.types ? q.types.split(',').map((t) => t.trim()).filter(Boolean) : undefined;

    const where: any = { clinicId: q.clinicId } as any;
    if (typesList && typesList.length > 0) {
      where.eventType = { in: typesList as any };
    }

    const rows = await prisma.event.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: q.limit,
      select: { id: true, eventType: true, actor: true, timestamp: true, metadata: true, customerId: true },
    });

    return NextResponse.json({ success: true, data: rows });
  } catch (e: any) {
    console.error('[events/recent] error', e);
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
  }
}
