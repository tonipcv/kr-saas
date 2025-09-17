import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { encryptSecret, decryptSecret } from '@/lib/crypto';
import { emitEvent } from '@/lib/events';
import { EventActor, EventType } from '@prisma/client';
import { getPhoneNumberInfo } from '@/lib/whatsapp';

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
  // Backfill columns in case table exists without new fields
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clinic_integrations' AND column_name = 'waba_id'
      ) THEN
        ALTER TABLE clinic_integrations ADD COLUMN waba_id TEXT;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clinic_integrations' AND column_name = 'meta'
      ) THEN
        ALTER TABLE clinic_integrations ADD COLUMN meta JSONB;
      END IF;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_clinic_integrations_clinic_provider
    ON clinic_integrations (clinic_id, provider);
  `);
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { clinicId, accessToken, phoneNumberId, wabaId, meta } = await req.json();
    if (!clinicId || !phoneNumberId) {
      return NextResponse.json({ error: 'clinicId and phoneNumberId are required' }, { status: 400 });
    }

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

    // Resolve access token: prefer provided; else use temporary from WHATSAPP_TMP
    let token = (accessToken || '').trim();
    if (!token) {
      const tmp = await prisma.$queryRawUnsafe<Array<{ api_key_enc: string; iv: string }>>(
        `SELECT api_key_enc, iv FROM clinic_integrations WHERE clinic_id = $1 AND provider = 'WHATSAPP_TMP' LIMIT 1`,
        clinicId,
      );
      if (!tmp || tmp.length === 0) {
        return NextResponse.json({ error: 'Access token not provided and no temporary token found. Start OAuth first.' }, { status: 400 });
      }
      token = decryptSecret(tmp[0].iv, tmp[0].api_key_enc);
    }

    // Validate token+phoneNumberId by fetching info
    const info = await getPhoneNumberInfo(token, phoneNumberId);
    const displayPhone = info?.display_phone_number || null;

    // Try to infer waba_id if not provided
    let finalWabaId: string | null = (wabaId ?? null) as string | null;
    if (!finalWabaId) {
      try {
        const GRAPH_BASE = process.env.WHATSAPP_GRAPH_BASE || 'https://graph.facebook.com';
        const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v20.0';
        const url = `${GRAPH_BASE}/${GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}?fields=whatsapp_business_account`;
        const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        const j = await r.json().catch(() => ({} as any));
        finalWabaId = j?.whatsapp_business_account?.id || null;
      } catch {}
    }

    const enc = encryptSecret(token);

    await prisma.$executeRawUnsafe(
      `INSERT INTO clinic_integrations (clinic_id, provider, api_key_enc, iv, instance_id, phone, status, last_seen_at, waba_id, meta)
       VALUES ($1, 'WHATSAPP', $2, $3, $4, $5, $6, now(), $7, $8::jsonb)
       ON CONFLICT (clinic_id, provider)
       DO UPDATE SET api_key_enc = EXCLUDED.api_key_enc, iv = EXCLUDED.iv, instance_id = EXCLUDED.instance_id,
                     phone = EXCLUDED.phone, status = EXCLUDED.status, waba_id = EXCLUDED.waba_id, meta = EXCLUDED.meta, updated_at = now()`,
      clinicId,
      enc.cipherText,
      enc.iv,
      phoneNumberId,
      displayPhone,
      'CONNECTED',
      finalWabaId,
      meta ? JSON.stringify(meta) : null,
    );

    // Optional: clean up temporary record
    await prisma.$executeRawUnsafe(`DELETE FROM clinic_integrations WHERE clinic_id = $1 AND provider = 'WHATSAPP_TMP'`, clinicId);

    // Emit integration_added event (do not block on errors)
    try {
      await emitEvent({
        eventType: EventType.integration_added,
        actor: EventActor.clinic,
        clinicId,
        customerId: null,
        metadata: { provider: 'whatsapp', phone: displayPhone, phoneNumberId, wabaId: finalWabaId },
      });
    } catch (e) {
      console.error('[events] integration_added emit failed', e);
    }

    return NextResponse.json({ success: true, phone: displayPhone, phoneNumberId, status: 'CONNECTED' });
  } catch (e: any) {
    console.error('WA connect error:', e);
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
