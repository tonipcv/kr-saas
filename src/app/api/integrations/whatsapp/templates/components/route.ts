import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decryptSecret } from '@/lib/crypto';

export async function GET(req: NextRequest) {
  try {
    const GRAPH_BASE = process.env.WHATSAPP_GRAPH_BASE || 'https://graph.facebook.com';
    const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v20.0';

    const { searchParams } = new URL(req.url);
    const clinicId = searchParams.get('clinicId');
    const name = (searchParams.get('name') || '').trim();
    if (!clinicId) return NextResponse.json({ error: 'clinicId is required' }, { status: 400 });
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

    const rows = await prisma.$queryRawUnsafe<Array<{ api_key_enc: string; iv: string; waba_id: string | null; instance_id: string | null }>>(
      `SELECT api_key_enc, iv, waba_id, instance_id FROM clinic_integrations WHERE clinic_id = $1 AND provider = 'WHATSAPP' LIMIT 1`,
      clinicId,
    );
    if (!rows || rows.length === 0) return NextResponse.json({ error: 'WhatsApp is not connected for this clinic' }, { status: 400 });

    const row = rows[0];
    const token = decryptSecret(row.iv, row.api_key_enc);
    let wabaId = row.waba_id;
    const phoneNumberId = row.instance_id;

    if (!wabaId && phoneNumberId) {
      try {
        const inferUrl = `${GRAPH_BASE}/${GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}?fields=whatsapp_business_account`;
        const r = await fetch(inferUrl, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        const j = await r.json().catch(() => ({} as any));
        wabaId = j?.whatsapp_business_account?.id || null;
        if (wabaId) await prisma.$executeRawUnsafe(`UPDATE clinic_integrations SET waba_id = $1, updated_at = now() WHERE clinic_id = $2 AND provider = 'WHATSAPP'`, wabaId, clinicId);
      } catch {}
    }
    if (!wabaId) return NextResponse.json({ error: 'Missing waba_id; reconnect WhatsApp to populate it.' }, { status: 400 });

    const url = `${GRAPH_BASE}/${GRAPH_VERSION}/${encodeURIComponent(wabaId)}/message_templates?name=${encodeURIComponent(name)}&fields=id,name,status,category,language,quality_score,components`;
    const res = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = (data?.error?.message || (typeof data?.error === 'string' ? data.error : null) || 'Graph error');
      return NextResponse.json({ error: errMsg, details: data }, { status: res.status });
    }
    // It returns a list filtered by name; take first match
    const list = Array.isArray(data?.data) ? data.data : [];
    const item = list.find((t: any) => t?.name === name) || list[0] || null;
    return NextResponse.json({ success: true, data: item });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
  }
}
