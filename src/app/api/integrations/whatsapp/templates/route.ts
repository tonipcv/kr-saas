import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decryptSecret } from '@/lib/crypto';

export async function GET(req: NextRequest) {
  try {
    const GRAPH_BASE = process.env.WHATSAPP_GRAPH_BASE || 'https://graph.facebook.com';
    const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v20.0';

    const { searchParams } = new URL(req.url);
    const clinicId = searchParams.get('clinicId');
    if (!clinicId) return NextResponse.json({ error: 'clinicId is required' }, { status: 400 });

    // Read integration row
    const rows = await prisma.$queryRawUnsafe<Array<{ api_key_enc: string; iv: string; waba_id: string | null; instance_id: string | null }>>(
      `SELECT api_key_enc, iv, waba_id, instance_id FROM clinic_integrations WHERE clinic_id = $1 AND provider = 'WHATSAPP' LIMIT 1`,
      clinicId,
    );
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'WhatsApp is not connected for this clinic' }, { status: 400 });
    }

    const row = rows[0];
    const token = decryptSecret(row.iv, row.api_key_enc);
    let wabaId = row.waba_id;
    const phoneNumberId = row.instance_id;

    // Try to infer missing wabaId from phone number
    if (!wabaId && phoneNumberId) {
      try {
        const inferUrl = `${GRAPH_BASE}/${GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}?fields=whatsapp_business_account`;
        const r = await fetch(inferUrl, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        const j = await r.json().catch(() => ({} as any));
        wabaId = j?.whatsapp_business_account?.id || null;
        if (wabaId) {
          await prisma.$executeRawUnsafe(`UPDATE clinic_integrations SET waba_id = $1, updated_at = now() WHERE clinic_id = $2 AND provider = 'WHATSAPP'`, wabaId, clinicId);
        }
      } catch {}
    }

    // Prefer WABA route; fallback to phone_number if needed
    let res: Response | null = null;
    let data: any = null;
    if (wabaId) {
      const url = `${GRAPH_BASE}/${GRAPH_VERSION}/${encodeURIComponent(wabaId)}/message_templates?fields=id,name,status,category,language,quality_score`;
      res = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      data = await res.json().catch(() => ({}));
      if (!res.ok && phoneNumberId) {
        const altUrl = `${GRAPH_BASE}/${GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}/message_templates?fields=id,name,status,category,language,quality_score`;
        const altRes = await fetch(altUrl, { method: 'GET', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        const altData = await altRes.json().catch(() => ({}));
        if (altRes.ok) {
          res = altRes; data = altData;
        } else {
          const errMsg = (data?.error?.message || altData?.error?.message || (typeof data?.error === 'string' ? data.error : null) || (typeof altData?.error === 'string' ? altData.error : null) || 'Graph error');
          return NextResponse.json({ error: errMsg, details: { primary: data, fallback: altData } }, { status: altRes.status });
        }
      } else if (!res.ok) {
        const errMsg = (data?.error?.message || (typeof data?.error === 'string' ? data.error : null) || 'Graph error');
        return NextResponse.json({ error: errMsg, details: data }, { status: res.status });
      }
    } else if (phoneNumberId) {
      const altUrl = `${GRAPH_BASE}/${GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}/message_templates?fields=id,name,status,category,language,quality_score`;
      res = await fetch(altUrl, { method: 'GET', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = (data?.error?.message || (typeof data?.error === 'string' ? data.error : null) || 'Graph error');
        return NextResponse.json({ error: errMsg, details: data }, { status: res.status });
      }
    } else {
      return NextResponse.json({ error: 'Missing identifiers to fetch templates (no waba_id or phone_number_id). Reconnect.' }, { status: 400 });
    }

    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
  }
}

// Create a new WhatsApp template on the connected WABA
export async function POST(req: NextRequest) {
  try {
    const GRAPH_BASE = process.env.WHATSAPP_GRAPH_BASE || 'https://graph.facebook.com';
    const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v20.0';

    const body = await req.json();
    const clinicId = body?.clinicId as string | undefined;
    if (!clinicId) return NextResponse.json({ error: 'clinicId is required' }, { status: 400 });

    const name = (body?.name || '').trim();
    const category = (body?.category || '').trim(); // MARKETING | UTILITY | AUTHENTICATION
    const language = (body?.language || '').trim(); // e.g., pt_BR
    const components = body?.components; // per Graph spec
    if (!name || !category || !language || !Array.isArray(components) || components.length === 0) {
      return NextResponse.json({ error: 'name, category, language and components are required' }, { status: 400 });
    }

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

    const url = `${GRAPH_BASE}/${GRAPH_VERSION}/${encodeURIComponent(wabaId)}/message_templates`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, category, language, components }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = (data?.error?.message || (typeof data?.error === 'string' ? data.error : null) || 'Graph error');
      return NextResponse.json({ error: errMsg, details: data }, { status: res.status });
    }
    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
  }
}
