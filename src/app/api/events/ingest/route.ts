import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { emitEvent } from '@/lib/events';
import { eventEnvelopeSchema } from '@/lib/event-schemas';
import { Event } from '@prisma/client';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validate envelope (types + basic fields)
    const parsed = eventEnvelopeSchema.parse(body);

    // Optionally enforce auth/clinic membership if needed
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Here we could restrict clinic access; skipping for now or add a hook later.

    const ev: Event = await emitEvent(parsed);
    return NextResponse.json({ ok: true, id: ev.id });
  } catch (e: any) {
    const message = e?.issues ? 'Validation error' : (e?.message || 'Internal error');
    return NextResponse.json({ error: message, details: e?.issues || e?.stack }, { status: 400 });
  }
}
