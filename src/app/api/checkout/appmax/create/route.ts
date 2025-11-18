import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { AppmaxClient, buildAppmaxClientForMerchant } from '@/lib/appmax'

function jsonError(status: number, error: string, step: string, details?: any) {
  try { console.error('[appmax][create][error]', { step, error, details }); } catch {}
  return NextResponse.json({ error, step, details }, { status })
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const { productId, slug, buyer, items, method, installments, card, token, shipping, discount } = body || {}

    // Validate input
    if (!productId && !slug) return jsonError(400, 'productId ou slug ausente', 'input_validation')
    if (!method || !['card','pix'].includes(String(method))) return jsonError(400, 'method inválido (use card ou pix)', 'input_validation', { method })
    if (!buyer || !buyer?.email || !buyer?.name) return jsonError(400, 'buyer incompleto (name/email)', 'input_validation')

    // Resolve product/clinic/merchant
    let product: any = null
    let clinic: any = null
    if (productId) {
      product = await prisma.products.findUnique({ where: { id: String(productId) } })
    }
    if (!product && slug) {
      clinic = await prisma.clinic.findFirst({ where: { slug: String(slug) } })
      if (clinic) {
        product = await prisma.products.findFirst({ where: { clinicId: clinic.id } })
      }
    }
    if (!product) return jsonError(404, 'Produto não encontrado', 'resolve_product', { productId, slug })
    // Try resolve clinic by product relation; if not present, fallback to slug
    if (!clinic) {
      if (product?.clinicId) {
        clinic = await prisma.clinic.findUnique({ where: { id: String(product.clinicId) } })
      }
      if (!clinic && slug) {
        clinic = await prisma.clinic.findFirst({ where: { slug: String(slug) } })
      }
    }
    if (!clinic) return jsonError(404, 'Clínica não encontrada', 'resolve_clinic', { clinicId: product?.clinicId || null, slug })

    let merchant = clinic.merchantId
      ? await prisma.merchant.findUnique({ where: { id: String(clinic.merchantId) } })
      : null
    // Fallback by clinicId (unique)
    if (!merchant) {
      merchant = await prisma.merchant.findUnique({ where: { clinicId: String(clinic.id) } })
    }
    // Auto-provision minimal merchant if still missing
    if (!merchant) {
      try {
        merchant = await prisma.merchant.create({ data: { clinicId: String(clinic.id) } as any })
      } catch (e) {
        return jsonError(404, 'Merchant não encontrado', 'resolve_merchant', { clinicId: clinic.id })
      }
    }

    // Build Appmax client from MerchantIntegration
    let client: AppmaxClient
    try {
      client = await buildAppmaxClientForMerchant(String(merchant.id))
    } catch (e: any) {
      return jsonError(400, e?.message || 'appmax_integration_error', 'resolve_integration')
    }

    // 1) Create/Update Customer on Appmax
    // Appmax requires several address fields; we pass what we have and leave optional otherwise
    const firstname = String((buyer.name || '').split(' ')[0] || buyer.name || 'Cliente')
    const lastname = String((buyer.name || '').split(' ').slice(1).join(' ') || '-')
    const customerPayload: any = {
      firstname,
      lastname,
      email: String(buyer.email),
      telephone: (buyer.telephone || buyer.phone || '').toString().replace(/\D+/g, '').slice(0, 11) || '11999999999',
      postcode: (buyer.postcode || buyer.zip || '').toString().replace(/\D+/g, '').slice(0, 8) || '01010000',
      address_street: buyer.address_street || buyer.street || 'Rua Desconhecida',
      address_street_number: buyer.address_street_number || buyer.number || '0',
      address_street_complement: buyer.address_street_complement || buyer.complement || '',
      address_street_district: buyer.address_street_district || buyer.district || 'Centro',
      address_city: buyer.address_city || buyer.city || 'São Paulo',
      address_state: buyer.address_state || buyer.state || 'SP',
      ip: buyer.ip || '127.0.0.1',
      tracking: {
        utm_source: buyer.utm_source || null,
        utm_campaign: buyer.utm_campaign || null,
        utm_medium: buyer.utm_medium || null,
        utm_content: buyer.utm_content || null,
        utm_term: buyer.utm_term || null,
      },
    }

    let customerResp: any
    try {
      customerResp = await client.customersCreate(customerPayload)
    } catch (e: any) {
      return jsonError(400, 'Falha ao criar cliente na Appmax', 'appmax_customers_create', { msg: e?.message, resp: e?.response })
    }
    const customer_id = Number(customerResp?.customer_id || customerResp?.id || customerResp?.data?.id || customerResp?.data?.customer_id)
    if (!customer_id || !Number.isFinite(customer_id)) return jsonError(400, 'Resposta inválida ao criar cliente', 'appmax_customers_create_parse', { customerResp })

    // 2) Create Order
    // Build products list
    const prods = Array.isArray(items) && items.length > 0 ? items.map((it: any) => ({
      sku: String(it.sku || product?.sku || product?.id),
      name: String(it.name || product?.name || 'Produto'),
      qty: Number(it.qty || 1),
      ...(it.price ? { price: Number(it.price) } : {}),
      ...(it.digital_product != null ? { digital_product: it.digital_product ? 1 : 0 } : {}),
    })) : [
      { sku: String(product?.sku || product?.id), name: String(product?.name || 'Produto'), qty: 1 }
    ]

    const totalFromItems = (() => {
      const withUnit = prods.every((p: any) => typeof p.price === 'number')
      if (withUnit) return prods.reduce((acc: number, p: any) => acc + Number(p.price || 0) * Number(p.qty || 1), 0)
      return null
    })()

    const orderPayload: any = {
      total: totalFromItems == null ? Number(product?.price || 0) : undefined,
      products: prods,
      shipping: typeof shipping === 'number' ? Number(shipping) : 0,
      discount: typeof discount === 'number' ? Number(discount) : 0,
      customer_id,
      freight_type: 'PAC',
    }

    let orderResp: any
    try {
      orderResp = await client.ordersCreate(orderPayload)
    } catch (e: any) {
      return jsonError(400, 'Falha ao criar pedido na Appmax', 'appmax_orders_create', { msg: e?.message, resp: e?.response })
    }
    const order_id = Number(orderResp?.order_id || orderResp?.id || orderResp?.data?.id)
    if (!order_id || !Number.isFinite(order_id)) return jsonError(400, 'Resposta inválida ao criar pedido', 'appmax_orders_create_parse', { orderResp })

    // 3) Persist early row for visibility
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO payment_transactions (
           id, provider, provider_order_id, clinic_id, product_id,
           amount_cents, currency, payment_method_type, status, raw_payload, routed_provider, client_name, client_email
         ) VALUES (
           gen_random_uuid(), 'appmax', $1, $2, $3,
           $4, 'BRL', $5, 'processing', $6::jsonb, 'APPMAX', $7, $8
         ) ON CONFLICT DO NOTHING`,
        String(order_id),
        String(product.clinicId),
        String(product.id),
        Math.round(Number(product?.price || 0) * 100) || 0,
        method === 'card' ? 'credit_card' : (method === 'pix' ? 'pix' : null),
        JSON.stringify({ step: 'create_order', customerResp, orderResp, buyer: { name: buyer.name, email: buyer.email } }),
        String(buyer.name || ''),
        String(buyer.email || '')
      )
    } catch {}

    // 4) Payment (card or pix)
    if (method === 'card') {
      // Tokenization-first if token provided or card present
      let ccToken: string | null = null
      if (token && typeof token === 'string') {
        ccToken = token
      } else if (card && (card.number && card.cvv && card.month && card.year)) {
        try {
          const tokResp = await client.tokenizeCard({
            card: {
              name: String(card.name || buyer.name),
              number: String(card.number),
              cvv: String(card.cvv),
              month: Number(card.month),
              year: Number(card.year),
            }
          })
          ccToken = tokResp?.token || tokResp?.data?.token || null
        } catch (e: any) {
          // Fallback: proceed without token, sending raw card details in payment payload
          try { console.warn('[appmax][tokenize][warn] fallback to raw card payment', e?.message || e) } catch {}
          ccToken = null
        }
      } else {
        return jsonError(400, 'Dados de cartão ou token ausentes', 'input_validation', { need: 'card or token' })
      }

      const payPayload: any = {
        cart: { order_id },
        customer: { customer_id },
        payment: { CreditCard: ccToken ? { token: ccToken, installments: Number(installments || 1), soft_descriptor: 'KRXLABS' } : {
          number: String(card.number),
          cvv: String(card.cvv),
          month: Number(card.month),
          year: Number(card.year),
          document_number: (buyer.document_number || buyer.document || '').toString().replace(/\D+/g, '').slice(0, 14),
          name: String(card.name || buyer.name),
          installments: Number(installments || 1),
          soft_descriptor: 'KRXLABS',
        } }
      }

      let payResp: any
      try {
        payResp = await client.paymentsCreditCard(payPayload)
      } catch (e: any) {
        return jsonError(400, 'Falha ao criar pagamento (cartão)', 'appmax_payment_card', { msg: e?.message, resp: e?.response })
      }

      // Best-effort update status to authorized/paid if retornado
      const mapped = (() => {
        const s = String(payResp?.status || payResp?.data?.status || '').toLowerCase()
        if (s.includes('aprov')) return 'paid'
        if (s.includes('autor')) return 'authorized'
        if (s.includes('pend')) return 'pending'
        return 'processing'
      })()

      try {
        await prisma.$executeRawUnsafe(
          `UPDATE payment_transactions SET status=$2, raw_payload=$3::jsonb, client_name=COALESCE(client_name,$4), client_email=COALESCE(client_email,$5), updated_at=NOW()
            WHERE provider='appmax' AND provider_order_id=$1`,
          String(order_id), mapped, JSON.stringify({ step: 'payment_card', payResp }), String(buyer.name||''), String(buyer.email||'')
        )
      } catch {}

      return NextResponse.json({ ok: true, provider: 'APPMAX', order_id, status: mapped })
    }

    if (method === 'pix') {
      // Build according to Appmax docs: requires payment.pix.document_number and expiration_date
      const doc = (buyer.document_number || buyer.document || '').toString().replace(/\D+/g, '')
      if (!doc) return jsonError(400, 'document_number ausente para PIX', 'input_validation', { need: 'buyer.document_number' })
      const expAt = (() => {
        // Format: YYYY-MM-DD HH:mm:ss (as in docs)
        const d = new Date(Date.now() + 30 * 60 * 1000)
        const pad = (n: number) => String(n).padStart(2, '0')
        const y = d.getFullYear()
        const m = pad(d.getMonth() + 1)
        const day = pad(d.getDate())
        const hh = pad(d.getHours())
        const mm = pad(d.getMinutes())
        const ss = pad(d.getSeconds())
        return `${y}-${m}-${day} ${hh}:${mm}:${ss}`
      })()
      const payPayload: any = {
        cart: { order_id },
        customer: { customer_id },
        payment: { pix: { document_number: doc, expiration_date: expAt } }
      }
      let payResp: any
      try {
        payResp = await client.paymentsPix(payPayload)
      } catch (e: any) {
        return jsonError(400, 'Falha ao criar pagamento (pix)', 'appmax_payment_pix', { msg: e?.message, resp: e?.response })
      }

      const mapped = (() => {
        const s = String(payResp?.status || payResp?.data?.status || '').toLowerCase()
        if (s.includes('aprov')) return 'paid'
        if (s.includes('autor')) return 'authorized'
        if (s.includes('pend')) return 'pending'
        return 'processing'
      })()

      try {
        await prisma.$executeRawUnsafe(
          `UPDATE payment_transactions SET status=$2, raw_payload=$3::jsonb, client_name=COALESCE(client_name,$4), client_email=COALESCE(client_email,$5), updated_at=NOW()
            WHERE provider='appmax' AND provider_order_id=$1`,
          String(order_id), mapped, JSON.stringify({ step: 'payment_pix', payResp }), String(buyer.name||''), String(buyer.email||'')
        )
      } catch {}

      // Extract PIX fields when available
      const pix = {
        qr_code: payResp?.pix?.qr_code || payResp?.data?.pix?.qr_code || null,
        qr_code_base64: payResp?.pix?.qr_code_base64 || payResp?.data?.pix?.qr_code_base64 || null,
        copy_paste: payResp?.pix?.copy_paste || payResp?.data?.pix?.copy_paste || null,
        expires_at: payResp?.pix?.expires_at || payResp?.data?.pix?.expires_at || null,
      }
      return NextResponse.json({ ok: true, provider: 'APPMAX', order_id, status: mapped, pix })
    }

    return jsonError(400, 'method não suportado', 'input_validation')
  } catch (e: any) {
    try { console.error('[appmax][create][unhandled]', e) } catch {}
    return NextResponse.json({ error: e?.message || 'internal_error', step: 'unhandled' }, { status: 500 })
  }
}
