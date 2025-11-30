import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const body = await req.text()
  const headers = Object.fromEntries(new Headers(req.headers).entries())
  console.log('[OUTBOUND WEBHOOK] headers=', headers)
  console.log('[OUTBOUND WEBHOOK] body=', body)
  return NextResponse.json({ ok: true })
}
