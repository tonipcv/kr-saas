import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { emitEvent } from '@/lib/events';
import { EventActor, EventType } from '@prisma/client';

// POST /api/events/debug
// Body: { clinicId: string, customerId?: string, action?: 'create'|'update'|'delete', payload?: any }
// Emits a test event (customer_created/updated or config_changed) and returns recent events for that clinic.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const clinicId: string | undefined = body?.clinicId || undefined;
    const customerId: string | undefined = body?.customerId || undefined;
    const action: 'create' | 'update' | 'delete' = (body?.action || 'create');
    const payload = body?.payload || {};

    if (!clinicId) return NextResponse.json({ error: 'clinicId is required' }, { status: 400 });

    // Emit
    let eventType: EventType;
    let metadata: any = {};
    let eventId = '';
    const nowId = customerId || `dbg_${Date.now()}`;

    if (action === 'create') {
      eventType = EventType.customer_created;
      metadata = { nome: payload?.nome || 'Debug User' };
      eventId = `dbg_customer_created_${clinicId}_${nowId}`;
    } else if (action === 'update') {
      eventType = EventType.customer_updated;
      metadata = { changes: payload?.changes || { field: 'name', from: 'Old', to: 'New' } };
      eventId = `dbg_customer_updated_${clinicId}_${nowId}`;
    } else {
      eventType = EventType.config_changed;
      metadata = { field_changed: 'debug_deleted_manual', old_value: { id: nowId }, new_value: null };
      eventId = `dbg_deleted_${clinicId}_${nowId}`;
    }

    console.log('[events][debug] emit', { clinicId, customerId: nowId, eventType, eventId, metadata });
    await emitEvent({
      eventId,
      eventType,
      actor: EventActor.clinic,
      clinicId,
      customerId: nowId,
      metadata,
    });

    // Return recent events for this clinic
    const recent = await prisma.event.findMany({
      where: { clinicId },
      orderBy: { timestamp: 'desc' },
      take: 10,
      select: { id: true, eventId: true, eventType: true, actor: true, timestamp: true, metadata: true, customerId: true },
    });

    return NextResponse.json({ ok: true, emitted: { clinicId, customerId: nowId, eventType, eventId, metadata }, recent });
  } catch (e: any) {
    console.error('[events][debug] error', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}

// GET /api/events/debug?clinicId=...&limit=10
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const clinicId = searchParams.get('clinicId');
    const limit = Math.max(1, Math.min(200, Number(searchParams.get('limit') || 10)));
    if (!clinicId) return NextResponse.json({ error: 'clinicId is required' }, { status: 400 });

    const recent = await prisma.event.findMany({
      where: { clinicId },
      orderBy: { timestamp: 'desc' },
      take: limit,
      select: { id: true, eventId: true, eventType: true, actor: true, timestamp: true, metadata: true, customerId: true },
    });

    return NextResponse.json({ ok: true, recent });
  } catch (e: any) {
    console.error('[events][debug][GET] error', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}
