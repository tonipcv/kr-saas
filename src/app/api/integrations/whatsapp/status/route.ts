import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { decryptSecret } from '@/lib/crypto';
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
  // Backfill new columns
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clinic_integrations' AND column_name = 'waba_id') THEN
        ALTER TABLE clinic_integrations ADD COLUMN waba_id TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clinic_integrations' AND column_name = 'meta') THEN
        ALTER TABLE clinic_integrations ADD COLUMN meta JSONB;
      END IF;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_clinic_integrations_clinic_provider
    ON clinic_integrations (clinic_id, provider);
  `);
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const clinicId = searchParams.get('clinicId');
    if (!clinicId) return NextResponse.json({ error: 'clinicId is required' }, { status: 400 });

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

    const rows = await prisma.$queryRawUnsafe<Array<{ api_key_enc: string; iv: string; instance_id: string | null; phone: string | null; status: string | null; last_seen_at: Date | null; waba_id: string | null }>>(
      `SELECT api_key_enc, iv, instance_id, phone, status, last_seen_at, waba_id FROM clinic_integrations WHERE clinic_id = $1 AND provider = 'WHATSAPP' LIMIT 1`,
      clinicId,
    );
    if (!rows || rows.length === 0) return NextResponse.json({ exists: false, status: 'DISCONNECTED' });

    const row = rows[0];
    let payload: any = {
      exists: true,
      phoneNumberId: row.instance_id,
      phone: row.phone,
      status: row.status || 'UNKNOWN',
      lastSeenAt: row.last_seen_at,
      wabaId: (row as any).waba_id || null,
    };

    try {
      if (row.instance_id) {
        const token = decryptSecret(row.iv, row.api_key_enc);
        const info = await getPhoneNumberInfo(token, row.instance_id);
        payload = {
          ...payload,
          phone: info?.display_phone_number || payload.phone,
          status: 'CONNECTED',
        };
      }
    } catch (e) {
      // keep stored status
    }

    return NextResponse.json(payload);
  } catch (e: any) {
    console.error('WA status error:', e);
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
