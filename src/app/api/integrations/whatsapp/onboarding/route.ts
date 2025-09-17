import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decryptSecret } from '@/lib/crypto';

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
      waba_id TEXT,
      meta JSONB,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);
}

export async function GET(req: NextRequest) {
  try {
    const GRAPH_BASE = process.env.WHATSAPP_GRAPH_BASE || 'https://graph.facebook.com';
    const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v20.0';
    const { searchParams } = new URL(req.url);
    const clinicId = searchParams.get('clinicId');
    const type = (searchParams.get('type') || '').toLowerCase();
    const businessId = searchParams.get('business_id');
    const wabaId = searchParams.get('waba_id');
    if (!clinicId) return NextResponse.json({ error: 'clinicId is required' }, { status: 400 });
    if (!['businesses','wabas','numbers'].includes(type)) return NextResponse.json({ error: 'invalid type' }, { status: 400 });

    await ensureTable();

    const tmpRows = await prisma.$queryRawUnsafe<Array<{ api_key_enc: string; iv: string }>>(
      `SELECT api_key_enc, iv FROM clinic_integrations WHERE clinic_id = $1 AND provider = 'WHATSAPP_TMP' LIMIT 1`,
      clinicId,
    );
    if (!tmpRows || tmpRows.length === 0) return NextResponse.json({ error: 'No temporary token. Start OAuth first.' }, { status: 400 });
    const token = decryptSecret(tmpRows[0].iv, tmpRows[0].api_key_enc);

    let url = '';
    if (type === 'businesses') {
      url = `${GRAPH_BASE}/${GRAPH_VERSION}/me/businesses?fields=id,name,verification_status`;
    } else if (type === 'wabas') {
      if (!businessId) return NextResponse.json({ error: 'business_id is required' }, { status: 400 });
      url = `${GRAPH_BASE}/${GRAPH_VERSION}/${encodeURIComponent(businessId)}/owned_whatsapp_business_accounts?fields=id,name`;
    } else if (type === 'numbers') {
      if (!wabaId) return NextResponse.json({ error: 'waba_id is required' }, { status: 400 });
      url = `${GRAPH_BASE}/${GRAPH_VERSION}/${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name`;
    }

    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return NextResponse.json({ error: data.error || 'Graph error', details: data }, { status: res.status });

    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
  }
}
