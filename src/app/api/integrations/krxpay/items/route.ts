import { NextResponse } from 'next/server'

function ok(data: any, init?: number) { return NextResponse.json(data, { status: init || 200 }) }
function bad(message: string, extra?: any) { return NextResponse.json({ error: message, ...(extra||{}) }, { status: 400 }) }
function fail(message: string, extra?: any) { return NextResponse.json({ error: message, ...(extra||{}) }, { status: 500 }) }

export async function GET(req: Request) {
  try {
    const apiKey = process.env.PAGARME_API_KEY || process.env.KRXPAY_API_KEY
    const baseUrl = process.env.KRXPAY_BASE_URL
    if (!apiKey || !baseUrl) return bad('KRXPAY not configured')
    const url = new URL(req.url)
    const query = (url.searchParams.get('query') || '').trim()
    const limit = Math.min(Number(url.searchParams.get('limit') || '20'), 50)

    const params: Record<string, any> = { limit }
    if (query) params.query = query

    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/items?` + new URLSearchParams(params as any).toString(), {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    })
    const js = await res.json().catch(() => ({}))
    if (!res.ok) return fail('Failed to list KRXPAY items', { message: js?.error || js?.message || 'Unknown error' })

    const arr = Array.isArray(js?.data) ? js.data : (Array.isArray(js) ? js : [])
    const items = arr.map((it: any) => ({ id: it.id || it.item_id || it.code, name: it.name || it.title || it.description || String(it.id) }))
    return ok({ ok: true, items })
  } catch (e: any) {
    return fail('Failed to list KRXPAY items', { message: e?.message || 'Unknown error' })
  }
}
