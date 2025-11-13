import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  try {
    const h = (name: string) => (req.headers.get(name) || req.headers.get(name.toLowerCase()) || req.headers.get(name.toUpperCase())) || '';
    // 1) Country headers from edge/CDN
    const headerCountry = [
      h('x-vercel-ip-country'),
      h('cf-ipcountry'),
      h('x-country'),
      h('x-krx-country'),
      h('x-geo-country'),
    ]
      .map(s => String(s || '').trim().toUpperCase())
      .find(s => /^[A-Z]{2}$/.test(s));

    const url = new URL(req.url);
    // 2) Local dev/testing override
    const ccParam = (url.searchParams.get('cc') || '').toUpperCase();
    if (/^[A-Z]{2}$/.test(ccParam)) {
      return NextResponse.json({ country: ccParam });
    }

    if (headerCountry) {
      return NextResponse.json({ country: headerCountry });
    }

    // 3) Derive client IP from headers
    const xff = h('x-forwarded-for');
    const xri = h('x-real-ip');
    const cfc = h('cf-connecting-ip');
    const ip = (xff.split(',')[0] || xri || cfc || '').trim();
    // Ignore local/private IPs
    const isPrivate = (v: string) => /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(v);
    if (!ip || isPrivate(ip)) {
      return NextResponse.json({ country: null });
    }

    // 4) Public IP geolookup
    try {
      const geoRes = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, { cache: 'no-store' });
      const gj = await geoRes.json().catch(() => ({}));
      const code = (gj?.country_code || gj?.countryCode || '').toString().toUpperCase();
      if (code && /^[A-Z]{2}$/.test(code)) {
        return NextResponse.json({ country: code });
      }
    } catch {}

    return NextResponse.json({ country: null });
  } catch (e: any) {
    return NextResponse.json({ country: null, error: e?.message || 'unknown' }, { status: 200 });
  }
}
