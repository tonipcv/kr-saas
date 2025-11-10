import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const tag = String(body?.tag || 'client');
    const data = body?.data ?? null;
    const time = new Date().toISOString();
    // Mirror client logs to server terminal
    try {
      // eslint-disable-next-line no-console
      console.log(`[client-log][${tag}] ${time}`, data);
    } catch {}
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
