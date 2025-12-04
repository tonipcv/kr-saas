import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

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

    await assertClinicAccess(session.user.id, clinicId);
    await ensureTable();

    const rows = await prisma.$queryRawUnsafe<Array<{ status: string | null }>>(
      `SELECT status FROM clinic_integrations WHERE clinic_id = $1 AND provider = 'KIT' LIMIT 1`,
      clinicId,
    );

    if (!rows || rows.length === 0) return NextResponse.json({ exists: false, status: 'DISCONNECTED' });

    const row = rows[0];
    return NextResponse.json({ exists: true, status: row.status || 'UNKNOWN' });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 });
  }
}
