import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function ok(data: any, init?: number) { return NextResponse.json(data, { status: init || 200 }) }
function bad(message: string, extra?: any) { return NextResponse.json({ error: message, ...(extra||{}) }, { status: 400 }) }
function fail(message: string, extra?: any) { return NextResponse.json({ error: message, ...(extra||{}) }, { status: 500 }) }

async function readStripeBody(res: Response) {
  try {
    const text = await res.text()
    try {
      return { text, json: JSON.parse(text) }
    } catch {
      return { text, json: null }
    }
  } catch {
    return { text: '', json: null }
  }
}

async function ensureStripeProduct(productId: string) {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('Stripe not configured')

  // Search by metadata
  const q = `metadata['app_product_id']:'${productId}'`
  const searchUrl = `https://api.stripe.com/v1/products/search?` + new URLSearchParams({ query: q }).toString()
  const searchRes = await fetch(searchUrl, { method: 'GET', headers: { 'Authorization': `Bearer ${key}` } })
  const searchBody = await readStripeBody(searchRes)
  if (searchRes.ok) {
    const dataArr = (searchBody.json as any)?.data
    if (Array.isArray(dataArr) && dataArr.length > 0) return dataArr[0].id as string
  } else {
    // If Search API is not enabled, Stripe returns parameter_unknown 'query'. Fallback to list pagination.
    console.warn('Stripe search failed, will fallback to list', { status: searchRes.status, body: searchBody.text?.slice(0, 400) })
    let starting_after: string | undefined = undefined
    let safety = 0
    while (safety < 5) { // up to ~500 items
      const params = new URLSearchParams({ limit: '100' })
      if (starting_after) params.set('starting_after', starting_after)
      const listRes = await fetch(`https://api.stripe.com/v1/products?${params.toString()}`, { headers: { 'Authorization': `Bearer ${key}` } })
      const listBody = await readStripeBody(listRes)
      if (!listRes.ok) {
        console.error('Stripe list failed', { status: listRes.status, body: listBody.text })
        break
      }
      const data = (listBody.json as any)?.data || []
      const found = data.find((p: any) => p?.metadata?.app_product_id === productId)
      if (found?.id) return found.id as string
      if ((listBody.json as any)?.has_more && data.length > 0) {
        starting_after = data[data.length - 1].id
        safety += 1
        continue
      }
      break
    }
  }

  // Create
  const prod = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, name: true, description: true } })
  const params = new URLSearchParams()
  params.set('name', (prod?.name && prod.name.trim()) ? prod.name.trim() : `Product ${productId}`)
  if (prod?.description && String(prod.description).trim().length > 0) {
    params.set('description', String(prod.description).trim())
  }
  params.set('metadata[app_product_id]', productId)
  const createRes = await fetch('https://api.stripe.com/v1/products', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  })
  const createBody = await readStripeBody(createRes)
  if (!createRes.ok) {
    const message = (createBody.json as any)?.error?.message || createBody.text || 'Failed to create Stripe Product'
    console.error('Stripe create failed', { status: createRes.status, body: createBody.text })
    const err: any = new Error(message)
    ;(err as any).stripeStatus = createRes.status
    ;(err as any).stripeBody = createBody.text
    throw err
  }
  const createdId = (createBody.json as any)?.id
  if (!createdId) {
    console.error('Stripe create missing id', { status: createRes.status, body: createBody.text })
    throw new Error('Stripe create response missing id')
  }
  return createdId as string
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const productId = String(body?.productId || '')
    if (!productId) return bad('productId is required')

    const externalProductId = await ensureStripeProduct(productId)

    // Persist mapping
    const up = await prisma.productIntegration.upsert({
      where: { productId_provider: { productId, provider: 'STRIPE' as any } },
      update: { externalProductId },
      create: { productId, provider: 'STRIPE' as any, externalProductId },
    })

    return ok({ ok: true, externalProductId: up.externalProductId })
  } catch (e: any) {
    console.error('Ensure Stripe product error', { message: e?.message, stack: e?.stack, stripeStatus: e?.stripeStatus, stripeBody: e?.stripeBody })
    return fail('Failed to ensure Stripe product', { message: e?.message || 'Unknown error', stripeStatus: e?.stripeStatus || null, stripeBody: e?.stripeBody || null })
  }
}
