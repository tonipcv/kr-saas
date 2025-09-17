import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const querySchema = z.object({
  clinicId: z.string().min(1),
  customerId: z.string().min(1),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  cursor: z.string().optional(), // event id cursor for pagination
  limit: z.coerce.number().min(1).max(200).default(50),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.parse({
      clinicId: searchParams.get('clinicId'),
      customerId: searchParams.get('customerId'),
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
      cursor: searchParams.get('cursor') || undefined,
      limit: searchParams.get('limit') || undefined,
    });

    const where: string[] = ['clinic_id = $1', 'customer_id = $2'];
    const params: any[] = [parsed.clinicId, parsed.customerId];
    let idx = params.length;

    if (parsed.from) { where.push(`timestamp >= $${++idx}`); params.push(parsed.from); }
    if (parsed.to) { where.push(`timestamp <= $${++idx}`); params.push(parsed.to); }

    if (parsed.cursor) {
      // Use created_at as tiebreaker; fetch record and paginate by (created_at, id)
      const c = await prisma.$queryRawUnsafe<any[]>(`SELECT created_at FROM events WHERE id = $1`, parsed.cursor);
      if (c && c[0]?.created_at) {
        where.push(`(created_at, id) < ($${++idx}, $${++idx})`);
        params.push(c[0].created_at.toISOString(), parsed.cursor);
      }
    }

    const sql = `
      SELECT id, event_type, actor, timestamp, metadata, created_at
      FROM events
      WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC, id DESC
      LIMIT $${++idx}
    `;
    params.push(parsed.limit + 1);

    const rows = await prisma.$queryRawUnsafe<any[]>(sql, ...params);
    const hasMore = rows.length > parsed.limit;
    const data = hasMore ? rows.slice(0, parsed.limit) : rows;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return NextResponse.json({ ok: true, data, nextCursor });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
  }
}
