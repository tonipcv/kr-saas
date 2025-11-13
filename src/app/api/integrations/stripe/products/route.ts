import { NextResponse } from 'next/server'

function ok(data: any, init?: number) { return NextResponse.json(data, { status: init || 200 }) }
function bad(message: string, extra?: any) { return NextResponse.json({ error: message, ...(extra||{}) }, { status: 400 }) }
function fail(message: string, extra?: any) { return NextResponse.json({ error: message, ...(extra||{}) }, { status: 500 }) }

export async function GET(req: Request) {
  try {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) return bad('Stripe not configured')
    const url = new URL(req.url)
    const query = url.searchParams.get('query') || ''
    const limit = Math.min(Number(url.searchParams.get('limit') || '20'), 50)

    let endpoint = 'https://api.stripe.com/v1/products'
    const params = new URLSearchParams()
    params.set('limit', String(limit))
    if (query) {
      endpoint = 'https://api.stripe.com/v1/products/search'
      // Stripe Search API syntax
      params.set('query', `name~'${query}' OR metadata['app_product_id']:'${query}'`)
    }

    const res = await fetch(`${endpoint}?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${key}` }
    })
    const js = await res.json().catch(() => ({}))
    if (!res.ok) return fail('Failed to list Stripe products', { message: js?.error?.message || 'Unknown error' })

    const items = Array.isArray(js?.data) ? js.data.map((p: any) => ({ id: p.id, name: p.name, metadata: p.metadata || {} })) : []
    return ok({ ok: true, items })
  } catch (e: any) {
    return fail('Failed to list Stripe products', { message: e?.message || 'Unknown error' })
  }
}
