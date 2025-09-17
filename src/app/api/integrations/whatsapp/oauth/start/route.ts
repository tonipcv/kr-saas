import { NextRequest, NextResponse } from 'next/server';

function buildState(input: Record<string, any>) {
  // Minimal state encoding (base64 JSON). In production, consider signing/HMAC.
  const json = JSON.stringify(input);
  return Buffer.from(json, 'utf8').toString('base64url');
}

export async function GET(req: NextRequest) {
  try {
    const FB_APP_ID = process.env.FB_APP_ID || '';
    const FB_REDIRECT_URI = process.env.FB_REDIRECT_URI || '';
    const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v20.0';
    if (!FB_APP_ID || !FB_REDIRECT_URI) {
      return NextResponse.json({ error: 'Missing FB_APP_ID or FB_REDIRECT_URI' }, { status: 500 });
    }
    const { searchParams } = new URL(req.url);
    const clinicId = searchParams.get('clinicId') || '';
    const returnTo = searchParams.get('returnTo') || '/doctor/integrations';
    if (!clinicId) return NextResponse.json({ error: 'clinicId is required' }, { status: 400 });

    const state = buildState({ clinicId, returnTo, ts: Date.now() });
    const scope = ['whatsapp_business_management','whatsapp_business_messaging','business_management'].join(',');
    const authUrl = `https://www.facebook.com/${encodeURIComponent(GRAPH_VERSION)}/dialog/oauth?client_id=${encodeURIComponent(FB_APP_ID)}&redirect_uri=${encodeURIComponent(FB_REDIRECT_URI)}&state=${encodeURIComponent(state)}&response_type=code&scope=${encodeURIComponent(scope)}`;
    return NextResponse.redirect(authUrl);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
  }
}
