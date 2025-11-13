import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PaymentProvider, Currency } from '@prisma/client'
import { randomUUID } from 'crypto'

function ok(data: any, init?: number) { return NextResponse.json(data, { status: init || 200 }) }
function bad(message: string, extra?: any) { return NextResponse.json({ error: message, ...(extra||{}) }, { status: 400 }) }
function fail(message: string, extra?: any) { return NextResponse.json({ error: message, ...(extra||{}) }, { status: 500 }) }

export async function GET(req: Request, { params }: { params: Promise<{ offerId: string }> }) {
  try {
    const { offerId } = await params
    const url = new URL(req.url)
    const country = (url.searchParams.get('country') || '').toUpperCase()
    const currency = (url.searchParams.get('currency') || '').toUpperCase() as keyof typeof Currency
    const provider = (url.searchParams.get('provider') || '').toUpperCase() as keyof typeof PaymentProvider

    const clauses: string[] = ['offer_id = $1']
    const args: any[] = [offerId]
    if (country && /^[A-Z]{2}$/.test(country)) { clauses.push('country = $' + (args.length+1)); args.push(country) }
    if (currency && /^[A-Z]{3}$/.test(currency)) { clauses.push('currency = $' + (args.length+1) + '::"Currency"'); args.push(currency) }
    if (provider && PaymentProvider[provider]) { clauses.push('provider = $' + (args.length+1) + '::"PaymentProvider"'); args.push(provider) }
    const sql = `SELECT id, offer_id as "offerId", country, currency as "currency", provider as "provider", amount_cents as "amountCents", external_price_id as "externalPriceId", active, created_at as "createdAt", updated_at as "updatedAt" FROM offer_prices WHERE ${clauses.join(' AND ')} ORDER BY updated_at DESC`;
    const rows = await prisma.$queryRawUnsafe<any[]>(sql, ...args)
    return ok({ prices: rows })
  } catch (e: any) {
    return fail('Failed to get offer prices', { message: e?.message || 'Unknown error' })
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ offerId: string }> }) {
  try {
    const { offerId } = await params
    const body = await req.json().catch(() => ({}))
    const country = String(body?.country || '').toUpperCase()
    const currency = String(body?.currency || '').toUpperCase()
    const provider = String(body?.provider || '').toUpperCase()
    if (!country || country.length !== 2) return bad('country is required (CC)')
    if (!/^[A-Z]{3}$/.test(currency)) return bad('invalid currency')
    if (!(provider in PaymentProvider)) return bad('invalid provider')
    const amountCents = Number.isFinite(Number(body?.amountCents)) ? Number(body.amountCents) : 0
    const externalPriceId = body?.externalPriceId ? String(body.externalPriceId) : null
    const active = typeof body?.active === 'boolean' ? !!body.active : true

    const sql = `
      INSERT INTO offer_prices (id, offer_id, country, currency, provider, amount_cents, external_price_id, active)
      VALUES ($1, $2, $3, $4::"Currency", $5::"PaymentProvider", $6, $7, $8)
      ON CONFLICT (offer_id, country, currency, provider)
      DO UPDATE SET amount_cents = EXCLUDED.amount_cents, external_price_id = EXCLUDED.external_price_id, active = EXCLUDED.active, updated_at = now()
      RETURNING id, offer_id as "offerId", country, currency as "currency", provider as "provider", amount_cents as "amountCents", external_price_id as "externalPriceId", active, created_at as "createdAt", updated_at as "updatedAt";
    `
    const id = randomUUID()
    const rows = await prisma.$queryRawUnsafe<any[]>(sql, id, offerId, country, currency, provider, amountCents, externalPriceId, active)
    return ok({ price: rows?.[0] || null })
  } catch (e: any) {
    return fail('Failed to upsert offer price', { message: e?.message || 'Unknown error' })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ offerId: string }> }) {
  try {
    const { offerId } = await params
    const url = new URL(req.url)
    const country = (url.searchParams.get('country') || '').toUpperCase()
    const currency = (url.searchParams.get('currency') || '').toUpperCase() as keyof typeof Currency
    const provider = (url.searchParams.get('provider') || '').toUpperCase() as keyof typeof PaymentProvider
    if (!country || country.length !== 2) return bad('country is required (CC)')
    if (!(currency in Currency)) return bad('invalid currency')
    if (!(provider in PaymentProvider)) return bad('invalid provider')

    await prisma.$executeRawUnsafe(`DELETE FROM offer_prices WHERE offer_id = $1 AND country = $2 AND currency = $3::"Currency" AND provider = $4::"PaymentProvider"`, offerId, country, currency, provider)
    return ok({ ok: true })
  } catch (e: any) {
    return fail('Failed to delete offer price', { message: e?.message || 'Unknown error' })
  }
}
