import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { decryptSecret } from '@/lib/crypto';
import { listInstances } from '@/lib/xase';

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
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const clinicId = searchParams.get('clinicId');
    if (!clinicId) return NextResponse.json({ error: 'clinicId is required' }, { status: 400 });

    // Verify access to clinic
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

    // Load integration
    const rows = await prisma.$queryRawUnsafe<Array<{
      id: string; clinic_id: string; provider: string; api_key_enc: string; iv: string; instance_id: string | null; phone: string | null; status: string | null; last_seen_at: Date | null;
    }>>(`SELECT * FROM clinic_integrations WHERE clinic_id = $1 AND provider = 'XASE' LIMIT 1`, clinicId);

    if (!rows || rows.length === 0) {
      return NextResponse.json({ exists: false, status: 'DISCONNECTED' });
    }

    const row = rows[0];

    // Re-validate current status with Xase
    let merged = {
      exists: true,
      instanceId: row.instance_id,
      phone: row.phone,
      status: row.status || 'DISCONNECTED',
      lastSeenAt: row.last_seen_at,
      updatedFromXase: false,
    } as any;

    try {
      const apiKey = decryptSecret(row.iv, row.api_key_enc);
      const resp = await listInstances(apiKey);
      const found = (resp.instances || []).find((i: any) => i.id === row.instance_id);
      if (found) {
        merged = {
          ...merged,
          phone: (found.connectedNumber as string | undefined) ?? (found.phone as string | undefined) ?? merged.phone,
          status: (found.status as string | undefined) ?? merged.status,
          lastSeenAt: (found.lastConnectedAt as string | undefined) ?? (found.lastSeenAt as string | undefined) ?? merged.lastSeenAt,
          updatedFromXase: true,
        };
      }
    } catch (e) {
      // Silent: keep stored values if Xase fails
    }

    return NextResponse.json(merged);
  } catch (e: any) {
    console.error('XASE status error:', e);
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
