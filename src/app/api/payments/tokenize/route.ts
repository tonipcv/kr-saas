import { NextRequest, NextResponse } from 'next/server'
import { pagarmeCreateCustomer, pagarmeCreateCustomerCard, isV5 } from '@/lib/pagarme'

// Tokenize card for KRXPAY (Pagar.me) and return a provider card_id to be used as a token.
// This avoids sending raw PAN/CVV to the general checkout endpoint.
// Security: do NOT log PAN/CVV; keep responses minimal.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const buyer = body?.buyer || {}
    const card = body?.card || {}
    const address = buyer?.address || {}

    // Basic checks
    if (!buyer?.name || !buyer?.email) {
      return NextResponse.json({ error: 'buyer.name and buyer.email are required' }, { status: 400 })
    }
    if (!card?.number || !card?.holder_name || !card?.exp_month || !card?.exp_year || !card?.cvv) {
      return NextResponse.json({ error: 'Incomplete card data' }, { status: 400 })
    }

    // Create a minimal customer (v5 requires a customer for cards)
    const customerPayload: any = {
      name: String(buyer.name),
      email: String(buyer.email),
      document: buyer?.document ? String(buyer.document) : undefined,
      type: (String(buyer?.document || '').replace(/\D/g, '').length > 11) ? 'company' : 'individual',
      address: {
        line_1: `${address?.street || 'Rua Desconhecida'}, ${address?.number || '0'}`,
        line_2: address?.line_2 ? String(address.line_2) : undefined,
        zip_code: String(address?.zip_code || '00000000').replace(/\D/g, ''),
        city: String(address?.city || 'São Paulo'),
        state: String(address?.state || 'SP'),
        country: String(address?.country || 'BR'),
      },
      phones: buyer?.phones || undefined,
      metadata: { source: 'checkout-tokenize' },
    }

    const createdCustomer = await pagarmeCreateCustomer(customerPayload)
    const customerId = createdCustomer?.id
    if (!customerId) {
      return NextResponse.json({ error: 'Failed to initialize customer for tokenization' }, { status: 502 })
    }

    // Create card for this customer (provider vault returns a card id)
    const cardPayload: any = {
      holder_name: String(card.holder_name),
      exp_month: Number(card.exp_month),
      exp_year: (() => { const y = Number(card.exp_year); return y < 100 ? 2000 + y : y })(),
      cvv: String(card.cvv),
      number: String(card.number).replace(/\s+/g, ''),
      billing_address: customerPayload.address,
      options: { verify_card: true },
    }

    const createdCard = await pagarmeCreateCustomerCard(customerId, cardPayload)
    const cardId = createdCard?.id || createdCard?.card?.id
    if (!cardId) {
      return NextResponse.json({ error: 'Failed to tokenize card' }, { status: 502 })
    }

    // Return only the token (cardId). Do not echo sensitive fields.
    return NextResponse.json({ ok: true, cardId, customerId })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'internal_error' }, { status: 500 })
  }
}
