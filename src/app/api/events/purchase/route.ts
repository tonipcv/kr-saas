import { NextRequest, NextResponse } from 'next/server';
import { emitEvent } from '@/lib/events';
import { EventActor, EventType } from '@prisma/client';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const clinicId: string | undefined = body?.clinicId || undefined;
    const customerId: string | undefined = body?.customerId || undefined;
    const value: number | undefined = typeof body?.value === 'number' ? body.value : Number(body?.value);
    const currency: string = (body?.currency || 'BRL').toString();
    const items = Array.isArray(body?.items) ? body.items : [];
    const channel: 'pos' | 'online' | 'whatsapp' | undefined = body?.channel;

    if (!clinicId) return NextResponse.json({ error: 'clinicId is required' }, { status: 400 });
    if (!value || !Number.isFinite(value) || value <= 0) return NextResponse.json({ error: 'value must be a positive number' }, { status: 400 });

    const eventId = `purchase_${clinicId}_${Date.now()}`;

    const ev = await emitEvent({
      eventId,
      eventType: EventType.purchase_made,
      actor: EventActor.clinic,
      clinicId,
      customerId,
      metadata: {
        value,
        currency,
        items,
        channel: channel || 'online',
      },
    });

    return NextResponse.json({ ok: true, event: { id: ev.id, eventId: ev.eventId, type: ev.eventType, timestamp: ev.timestamp } });
  } catch (e: any) {
    console.error('[events][purchase] error', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}
