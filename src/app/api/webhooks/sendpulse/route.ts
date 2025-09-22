import { NextRequest, NextResponse } from 'next/server';

// Stub webhook endpoint for SendPulse events. Safe and non-destructive.
// Later we'll validate signatures (if available) and persist events to EmailEvent.
export async function POST(req: NextRequest) {
  try {
    const text = await req.text();
    // Try parse json but avoid throwing if malformed
    let payload: any = null;
    try { payload = JSON.parse(text); } catch {}

    // Log minimal, non-sensitive details
    const safeLog = {
      provider: 'sendpulse',
      receivedAt: new Date().toISOString(),
      contentType: req.headers.get('content-type') || undefined,
      // Common fields some providers use; keep generic and safe
      event: payload?.event || payload?.type || undefined,
      messageId: payload?.message_id || payload?.messageId || undefined,
      to: payload?.recipient || payload?.to || undefined,
    };
    console.log('[webhooks/sendpulse] received', safeLog);

    // In the future: verify signature / IP allowlist
    // and persist to EmailEvent table.

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[webhooks/sendpulse] error', e?.message || e);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
