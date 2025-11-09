import { NextResponse } from 'next/server';

// POST /api/v2/return-to  { url: string }
export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Missing url' }, { status: 400 });
    }
    const res = NextResponse.json({ ok: true });
    // Store for up to 15 minutes; SameSite=Lax so it follows normal top-level redirects
    res.cookies.set('of_return_to', url, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 15 * 60,
    });
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

// GET /api/v2/return-to  -> { url: string | null }
export async function GET(req: Request) {
  try {
    // In App Router, cookies are not directly on Request. Use NextResponse? Instead, parse from headers.
    // However, in route handlers we can access cookies via the request headers.
    const cookieHeader = (req.headers as any).get?.('cookie') || '';
    const map = new Map<string, string>();
    cookieHeader.split(';').forEach((p: string) => {
      const idx = p.indexOf('=');
      if (idx > -1) {
        const k = p.slice(0, idx).trim();
        const v = decodeURIComponent(p.slice(idx + 1).trim());
        if (k) map.set(k, v);
      }
    });
    const url = map.get('of_return_to') || null;
    return NextResponse.json({ url });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
