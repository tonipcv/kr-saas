import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/v2/doctor/broadcast/audience?segment=all|inactive_30d|birthday_7d|purchased_30d
// Returns: { success, data: { count, sample: Array<{ id, name, phone }> } }
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const doctorId = session.user.id;
    const { searchParams } = new URL(req.url);
    const segment = (searchParams.get('segment') || 'all') as 'all' | 'inactive_30d' | 'birthday_7d' | 'purchased_30d';

    // Get all active patient IDs for this doctor (and their phones)
    const relations = await prisma.doctorPatientRelationship.findMany({
      where: { doctorId, isActive: true, patient: { phone: { not: null } } },
      select: { patientId: true, patient: { select: { name: true, phone: true, birth_date: true } } }
    });

    let patientIds = relations.map(r => r.patientId);

    // Quick early returns when no patients
    if (patientIds.length === 0) {
      return NextResponse.json({ success: true, data: { count: 0, sample: [] } });
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const pickSample = (ids: string[]) => {
      const map = new Map(relations.map(r => [r.patientId, r.patient] as const));
      return ids.slice(0, 10).map(id => ({ id, name: map.get(id)?.name || '', phone: map.get(id)?.phone || '' }));
    };

    if (segment === 'all') {
      const ids = patientIds;
      return NextResponse.json({ success: true, data: { count: ids.length, sample: pickSample(ids) } });
    }

    if (segment === 'inactive_30d') {
      // Active in last 30d = had customer_visit or purchase_made
      const recent = await prisma.event.findMany({
        where: {
          customerId: { in: patientIds },
          timestamp: { gte: thirtyDaysAgo },
          eventType: { in: ['customer_visit', 'purchase_made'] as any }
        },
        select: { customerId: true },
      });
      const activeSet = new Set(recent.map(e => e.customerId!).filter(Boolean));
      const ids = patientIds.filter(id => !activeSet.has(id));
      return NextResponse.json({ success: true, data: { count: ids.length, sample: pickSample(ids) } });
    }

    if (segment === 'purchased_30d') {
      const recent = await prisma.event.findMany({
        where: { customerId: { in: patientIds }, timestamp: { gte: thirtyDaysAgo }, eventType: 'purchase_made' as any },
        select: { customerId: true },
      });
      const set = new Set(recent.map(e => e.customerId!).filter(Boolean));
      const ids = patientIds.filter(id => set.has(id));
      return NextResponse.json({ success: true, data: { count: ids.length, sample: pickSample(ids) } });
    }

    if (segment === 'birthday_7d') {
      // filter by birth_date within next 7 days (ignoring year)
      const ids = relations
        .filter(r => {
          const bd = r.patient.birth_date;
          if (!bd) return false;
          const b = new Date(bd);
          // Build this year's birthday
          const thisYear = new Date(now.getFullYear(), b.getMonth(), b.getDate());
          const next = thisYear < now ? new Date(now.getFullYear() + 1, b.getMonth(), b.getDate()) : thisYear;
          return next >= now && next <= sevenDaysAhead;
        })
        .map(r => r.patientId);
      return NextResponse.json({ success: true, data: { count: ids.length, sample: pickSample(ids) } });
    }

    return NextResponse.json({ success: true, data: { count: 0, sample: [] } });
  } catch (e: any) {
    console.error('Audience endpoint error', e);
    return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
  }
}
