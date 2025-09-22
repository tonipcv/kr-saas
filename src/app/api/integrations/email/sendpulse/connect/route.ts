import { NextRequest, NextResponse } from 'next/server';

// Stub connector for SendPulse (safe MVP step). Does not change existing flows.
// Returns 501 to indicate it's not wired yet. This endpoint will later validate
// provided credentials and store them encrypted per clinic.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { clinicId, apiKey, apiSecret } = body || {};
    if (!clinicId) {
      return NextResponse.json({ error: 'clinicId required' }, { status: 400 });
    }
    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: 'apiKey and apiSecret required (stub)' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Not implemented', hint: 'Connector stub only' }, { status: 501 });
  } catch (e: any) {
    return NextResponse.json({ error: 'Invalid request', details: e?.message || String(e) }, { status: 400 });
  }
}
