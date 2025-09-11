import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { encryptSecret } from '@/lib/crypto';
import { listInstances } from '@/lib/xase';

async function ensureTable() {
  // Create table if not exists using raw SQL to avoid Prisma schema change for now
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

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { apiKey, clinicId } = body || {};
    if (!apiKey || !clinicId) {
      return NextResponse.json({ error: 'apiKey and clinicId are required' }, { status: 400 });
    }

    // Verify the user has access to the clinic (owner or member)
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
    if (!clinic) {
      return NextResponse.json({ error: 'Access denied to clinic' }, { status: 403 });
    }

    await ensureTable();

    // Validate key and find a CONNECTED instance (Xase fields: connectedNumber, lastConnectedAt)
    const instancesResp = await listInstances(apiKey);
    const connected = (instancesResp.instances || []).find((i: any) => (i.status || '').toUpperCase() === 'CONNECTED');
    if (!connected) {
      return NextResponse.json({ error: 'No CONNECTED instance found for this API key' }, { status: 400 });
    }

    const enc = encryptSecret(apiKey);

    // Upsert integration
    await prisma.$executeRawUnsafe(
      `INSERT INTO clinic_integrations (clinic_id, provider, api_key_enc, iv, instance_id, phone, status, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, now()))
       ON CONFLICT (clinic_id, provider)
       DO UPDATE SET api_key_enc = EXCLUDED.api_key_enc, iv = EXCLUDED.iv, instance_id = EXCLUDED.instance_id,
                     phone = EXCLUDED.phone, status = EXCLUDED.status, last_seen_at = EXCLUDED.last_seen_at, updated_at = now()`,
      clinicId,
      'XASE',
      enc.cipherText,
      enc.iv,
      connected.id,
      // Xase returns masked number as connectedNumber
      (connected.connectedNumber as string | null) ?? null,
      connected.status || 'CONNECTED',
      (connected.lastConnectedAt as string | null) ?? null,
    );

    return NextResponse.json({
      success: true,
      instanceId: connected.id,
      phone: (connected.connectedNumber as string | null) ?? null,
      status: connected.status || 'CONNECTED',
      lastSeenAt: (connected.lastConnectedAt as string | null) ?? null,
    });
  } catch (e: any) {
    console.error('XASE connect error:', e);
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
