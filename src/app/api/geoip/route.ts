import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  try {
    const h = new Headers(req.headers as any)
    const country = (
      h.get('cf-ipcountry') ||
      h.get('x-vercel-ip-country') ||
      h.get('x-geo-country') ||
      h.get('x-fastly-country-code') ||
      ''
    ).toUpperCase()
    if (country && country.length === 2) {
      return NextResponse.json({ country, source: 'edge-header' })
    }
    return NextResponse.json({ country: null, source: 'none' })
  } catch {
    return NextResponse.json({ country: null, source: 'none' })
  }
}
