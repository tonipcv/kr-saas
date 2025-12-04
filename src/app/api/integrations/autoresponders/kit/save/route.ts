import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { encryptSecret } from '@/lib/crypto';
import { emitEvent } from '@/lib/events';
import { EventActor, EventType } from '@prisma/client';

async function assertClinicAccess(userId: string, clinicId: string) {
  const clinic = await prisma.clinic.findFirst({
    where: {
      id: clinicId,
      OR: [
        { ownerId: userId },
        { members: { some: { userId, isActive: true } } },
      ],
    },
    select: { id: true },
  });
  if (!clinic) throw new Error('Access denied to clinic');
}

async function ensureTable() {
  // Ensure clinic_integrations exists (reuse WhatsApp pattern)
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
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
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
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { clinicId, apiKey } = await req.json();
    if (!clinicId || !apiKey) return NextResponse.json({ error: 'clinicId and apiKey are required' }, { status: 400 });

    await assertClinicAccess(session.user.id, clinicId);
    await ensureTable();

    const enc = encryptSecret(String(apiKey).trim());

    await prisma.$executeRawUnsafe(
      `INSERT INTO clinic_integrations (clinic_id, provider, api_key_enc, iv, status, last_seen_at, meta)
       VALUES ($1, 'KIT', $2, $3, 'CONNECTED', now(), $4::jsonb)
       ON CONFLICT (clinic_id, provider)
       DO UPDATE SET api_key_enc = EXCLUDED.api_key_enc,
                     iv = EXCLUDED.iv,
                     status = EXCLUDED.status,
                     last_seen_at = EXCLUDED.last_seen_at,
                     meta = EXCLUDED.meta,
                     updated_at = now()`,
      clinicId,
      enc.cipherText,
      enc.iv,
      JSON.stringify({ savedBy: session.user.id, savedAt: new Date().toISOString() })
    );

    try {
      await emitEvent({
        eventType: EventType.integration_added,
        actor: EventActor.clinic,
        clinicId,
        customerId: null,
        metadata: { provider: 'kit' },
      });
    } catch {}

    return NextResponse.json({ success: true, status: 'CONNECTED' });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 });
  }
}
