import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { decryptSecret } from '@/lib/crypto';
import { sendWhatsAppText } from '@/lib/whatsapp';
import { emitEvent } from '@/lib/events';
import { EventActor, EventType } from '@prisma/client';

async function ensureTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS clinic_integrations (
      id TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
      clinic_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      api_key_enc TEXT NOT NULL,
      iv TEXT NOT NULL,
      instance_id TEXT,
      phone TEXT,
      status TEXT,
      last_seen_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { clinicId, to, patientId, message } = await req.json();
    if (!clinicId) return NextResponse.json({ error: 'clinicId is required' }, { status: 400 });

    // Verify access
    const clinic = await prisma.clinic.findFirst({
      where: {
        id: clinicId,
        OR: [
          { ownerId: session.user.id },
          { members: { some: { userId: session.user.id, isActive: true } } },
        ],
      },
      select: { id: true },
    });
    if (!clinic) return NextResponse.json({ error: 'Access denied to clinic' }, { status: 403 });

    await ensureTable();

    const rows = await prisma.$queryRawUnsafe<Array<{ api_key_enc: string; iv: string; instance_id: string | null }>>(
      `SELECT api_key_enc, iv, instance_id FROM clinic_integrations WHERE clinic_id = $1 AND provider = 'WHATSAPP' LIMIT 1`,
      clinicId,
    );
    if (!rows || rows.length === 0) return NextResponse.json({ error: 'WhatsApp not configured' }, { status: 400 });

    const row = rows[0];
    if (!row.instance_id) return NextResponse.json({ error: 'WhatsApp phone number not set' }, { status: 400 });

    // Sanitize destination number: keep digits only (Graph expects international format without +)
    let target = (to || '').toString().trim();
    if (!target && patientId) {
      const patient = await prisma.user.findUnique({ where: { id: patientId }, select: { phone: true } });
      if (!patient?.phone) return NextResponse.json({ error: 'Patient has no phone' }, { status: 400 });
      target = patient.phone;
    }
    target = target.replace(/\D+/g, '');
    if (!target) return NextResponse.json({ error: 'Destination number is required' }, { status: 400 });
    if (target.length < 10) {
      return NextResponse.json({ error: 'Destination number looks invalid. Provide full international number with country code (e.g., 5511999999999).' }, { status: 400 });
    }

    const token = decryptSecret(row.iv, row.api_key_enc);
    let resp: any = null;
    try {
      resp = await sendWhatsAppText(token, row.instance_id, target, message || 'Olá!');
    } catch (err: any) {
      const hint = 'If the user did not message in the last 24h, you must use a pre-approved template to initiate the conversation.';
      return NextResponse.json({ error: err?.message || 'WhatsApp send failed', hint }, { status: 400 });
    }

    const msgId = resp?.messages?.[0]?.id;
    if (!msgId) {
      const errObj = resp?.error || resp;
      return NextResponse.json({ success: false, error: 'WhatsApp did not return a message id', details: errObj }, { status: 400 });
    }

    // Fire conversation_started event (non-blocking on failure)
    try {
      await emitEvent({
        eventType: EventType.conversation_started,
        actor: EventActor.clinic,
        clinicId,
        customerId: patientId ?? null,
        metadata: { channel: 'whatsapp', to: target },
      });
    } catch (e) {
      console.error('[events] conversation_started emit failed', e);
    }

    return NextResponse.json({ success: true, messageId: msgId, response: resp });
  } catch (e: any) {
    console.error('WA send error:', e);
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
