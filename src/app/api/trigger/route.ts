import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ status: 'ok', sdk: 'trigger.dev' })
}

export async function POST(req: Request) {
  const body = await req.text()
  console.log('[TRIGGER SDK] POST /api/trigger', body.substring(0, 200))
  return NextResponse.json({ ok: true })
}
