import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { EventType } from '@prisma/client';

const querySchema = z.object({
  clinicId: z.string().min(1),
  from: z.string().optional(),
  to: z.string().optional(),
  groupBy: z.enum(['day', 'hour']).default('day'),
  types: z.string().optional(), // CSV of EventType
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      clinicId: searchParams.get('clinicId'),
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
      groupBy: (searchParams.get('groupBy') as 'day' | 'hour') || 'day',
      types: searchParams.get('types') || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query', details: parsed.error.flatten() }, { status: 400 });
    }

    const q = parsed.data;
    const from = q.from ? new Date(q.from) : undefined;
    const to = q.to ? new Date(q.to) : undefined;
    if (q.from && (!from || Number.isNaN(from.getTime()))) {
      return NextResponse.json({ error: 'Invalid from datetime' }, { status: 400 });
    }
    if (q.to && (!to || Number.isNaN(to.getTime()))) {
      return NextResponse.json({ error: 'Invalid to datetime' }, { status: 400 });
    }
    const typesList = q.types
      ? parsed.types.split(',').map((t) => t.trim()).filter(Boolean)
      : undefined;

    // Build WHERE clause safely
    const where: string[] = ['clinic_id = $1'];
    const params: any[] = [q.clinicId];
    let idx = params.length;

    if (from) { where.push(`timestamp >= $${++idx}`); params.push(from); }
    if (to) { where.push(`timestamp <= $${++idx}`); params.push(to); }
    if (typesList && typesList.length > 0) {
      // Validate against enum names
      const valid = typesList.filter((t) => Object.values(EventType).includes(t as EventType));
      if (valid.length === 0) return NextResponse.json({ error: 'No valid event types' }, { status: 400 });
      where.push(`event_type = ANY($${++idx})`); params.push(valid);
    }

    const bucket = q.groupBy === 'hour' ? "date_trunc('hour', timestamp)" : "date_trunc('day', timestamp)";

    const sql = `
      SELECT ${bucket} AS bucket, event_type, COUNT(*)::int AS count
      FROM events
      WHERE ${where.join(' AND ')}
      GROUP BY bucket, event_type
      ORDER BY bucket ASC, event_type ASC
    `;

    const rows = await prisma.$queryRawUnsafe<any[]>(sql, ...params);

    // Also return totals per type
    const totalsSql = `
      SELECT event_type, COUNT(*)::int AS count
      FROM events
      WHERE ${where.join(' AND ')}
      GROUP BY event_type
      ORDER BY event_type ASC
    `;
    const totals = await prisma.$queryRawUnsafe<any[]>(totalsSql, ...params);

    // Shape into series buckets with totals and byType
    const seriesMap = new Map<string, { total: number; byType: Record<string, number> }>();
    for (const r of rows) {
      const key = new Date(r.bucket).toISOString();
      if (!seriesMap.has(key)) seriesMap.set(key, { total: 0, byType: {} });
      const entry = seriesMap.get(key)!;
      const c = Number(r.count || 0);
      entry.total += c;
      entry.byType[r.event_type] = (entry.byType[r.event_type] || 0) + c;
    }
    const series = Array.from(seriesMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({ date, total: v.total, byType: v.byType }));

    const summaryByType: Record<string, number> = {};
    let summaryTotal = 0;
    for (const t of totals) {
      const c = Number(t.count || 0);
      summaryByType[t.event_type] = c;
      summaryTotal += c;
    }

    return NextResponse.json({
      success: true,
      summary: { total: summaryTotal, byType: summaryByType },
      series,
      window: { from: from ? from.toISOString() : null, to: to ? to.toISOString() : null, groupBy: q.groupBy },
    });
  } catch (e: any) {
    console.error('[events/metrics] error', e);
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
  }
}
