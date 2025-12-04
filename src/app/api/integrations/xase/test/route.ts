import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { decryptSecret } from '@/lib/crypto';
import { sendMessage } from '@/lib/xase';

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

    const { clinicId, to, number, message } = await req.json();
    const target = (number || to || '').toString().trim();
    if (!clinicId || !target) return NextResponse.json({ error: 'clinicId and number are required' }, { status: 400 });

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
      `SELECT api_key_enc, iv, instance_id FROM clinic_integrations WHERE clinic_id = $1 AND provider = 'XASE' LIMIT 1`,
      clinicId,
    );
    if (!rows || rows.length === 0) return NextResponse.json({ error: 'Integration not configured' }, { status: 400 });

    const row = rows[0];
    if (!row.instance_id) return NextResponse.json({ error: 'No instance connected' }, { status: 400 });

    const apiKey = decryptSecret(row.iv, row.api_key_enc);
    const payload = {
      instanceId: row.instance_id,
      number: target,
      message: message || 'Teste de integração WhatsApp via Xase.ai.',
    };
    const resp = await sendMessage(apiKey, payload);
    return NextResponse.json({ success: true, response: resp });
  } catch (e: any) {
    console.error('XASE test send error:', e);
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
