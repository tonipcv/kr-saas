import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { buildAppmaxClientForMerchant } from '@/lib/payments/appmax/sdk'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const { productId, slug, clinicId: clinicIdIn, buyer, card, saveAsDefault } = body || {}

    // Validate minimal input
    if (!buyer?.email || !buyer?.name) {
      return NextResponse.json({ ok: false, error: 'buyer.name e buyer.email são obrigatórios' }, { status: 400 })
    }
    if (!card?.number || !card?.cvv || !card?.month || !card?.year) {
      return NextResponse.json({ ok: false, error: 'Dados de cartão incompletos' }, { status: 400 })
    }

    // Resolve clinic and merchant
    let clinic: any = null
    let product: any = null
    if (productId) {
      product = await prisma.product.findUnique({ where: { id: String(productId) }, select: { id: true, clinicId: true, name: true } })
    }
    if (!clinic && product?.clinicId) {
      clinic = await prisma.clinic.findUnique({ where: { id: String(product.clinicId) }, select: { id: true } })
    }
    if (!clinic && clinicIdIn) {
      clinic = await prisma.clinic.findUnique({ where: { id: String(clinicIdIn) }, select: { id: true } })
    }
    if (!clinic && slug) {
      clinic = await prisma.clinic.findFirst({ where: { slug: String(slug) }, select: { id: true } })
    }
    if (!clinic?.id) {
      return NextResponse.json({ ok: false, error: 'Clínica não encontrada' }, { status: 404 })
    }

    // Resolve merchant for clinic
    let merchant = await prisma.merchant.findUnique({ where: { clinicId: String(clinic.id) } })
    if (!merchant) {
      try { merchant = await prisma.merchant.create({ data: { clinicId: String(clinic.id) } as any }) } catch {}
    }
    if (!merchant?.id) return NextResponse.json({ ok: false, error: 'Merchant não encontrado' }, { status: 404 })

    // Build AppMax client
    let client: any
    try {
      client = await buildAppmaxClientForMerchant(String(merchant.id))
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message || 'appmax_integration_error' }, { status: 400 })
    }

    // 1) Tokenize card (backend-only per AppMax docs)
    let tokResp: any
    try {
      tokResp = await client.tokenizeCard({
        card: {
          name: String(card.name || buyer.name),
          number: String(card.number),
          cvv: String(card.cvv),
          month: Number(card.month),
          year: Number(card.year),
        }
      })
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message || 'Falha ao tokenizar cartão', details: e?.response || null }, { status: 400 })
    }
    const token: string | null = tokResp?.token || tokResp?.data?.token || null
    const brand: string | null = tokResp?.brand || tokResp?.data?.brand || null
    const last4: string | null = tokResp?.last4 || tokResp?.data?.last4 || String(card.number).slice(-4) || null
    if (!token) return NextResponse.json({ ok: false, error: 'Token ausente na resposta da AppMax' }, { status: 400 })

    // 2) Upsert unified Customer (merchant + email)
    const buyerEmail = String(buyer.email)
    const buyerName = String(buyer.name || '')
    const buyerPhone = String(buyer.phone || '')
    const docDigits = (buyer.document_number || buyer.document || '').toString().replace(/\D/g, '') || null

    let unifiedCustomerId: string | null = null
    try {
      const existing = await prisma.customer.findFirst({ where: { merchantId: String(merchant.id), email: buyerEmail }, select: { id: true } })
      if (existing?.id) {
        unifiedCustomerId = existing.id
        await prisma.customer.update({
          where: { id: existing.id },
          data: { name: buyerName || undefined, phone: buyerPhone || undefined, document: docDigits || undefined, updatedAt: new Date() }
        }).catch(() => {})
      } else {
        const created = await prisma.customer.create({
          data: { merchantId: String(merchant.id), email: buyerEmail, name: buyerName, phone: buyerPhone, document: docDigits, metadata: { source: 'appmax_tokenize' } as any },
          select: { id: true }
        })
        unifiedCustomerId = created.id
      }
    } catch (e) {}
    if (!unifiedCustomerId) return NextResponse.json({ ok: false, error: 'Falha ao resolver cliente unificado' }, { status: 500 })

    // 3) Ensure customer_providers (APPMAX) has a provider customer id when available later
    // We cannot create an AppMax customer id here without another API; leave empty but pre-create mapping row for account linkage
    try {
      const cp = await prisma.customerProvider.findFirst({ where: { customerId: unifiedCustomerId, provider: 'APPMAX' as any, accountId: String(merchant.id) }, select: { id: true } })
      if (!cp) {
        await prisma.customerProvider.create({ data: { customerId: unifiedCustomerId, provider: 'APPMAX' as any, accountId: String(merchant.id), metadata: { source: 'appmax_tokenize' } as any } })
      }
    } catch {}

    // 4) Save token to vault (customer_payment_methods)
    let saved: any = null
    try {
      const { VaultManager } = await import('@/lib/payments/vault/manager')
      const vault = new VaultManager()
      const savedRow = await vault.saveCard({
        customerId: unifiedCustomerId,
        provider: 'APPMAX',
        token,
        accountId: String(merchant.id),
        brand: brand || null,
        last4: last4 || null,
        expMonth: Number(card.month) || null,
        expYear: Number(card.year) || null,
        setAsDefault: !!saveAsDefault
      })
      saved = savedRow
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: 'Falha ao salvar token', details: e?.message || String(e) }, { status: 500 })
    }

    // 5) Return normalized method for immediate UI usage
    const response = {
      id: saved.id,
      customer_id: saved.customerId,
      provider: 'APPMAX',
      account_id: saved.accountId,
      provider_payment_method_id: token,
      brand: saved.brand || brand,
      last4: saved.last4 || last4,
      exp_month: saved.expMonth,
      exp_year: saved.expYear,
      is_default: saved.isDefault,
      status: saved.status,
      created_at: saved.createdAt,
      provider_customer_id: null as any // will be filled once AppMax customer_id is linked in an order or via separate sync
    }

    return NextResponse.json({ ok: true, data: response })
  } catch (e: any) {
    try { console.error('[appmax][tokenize-save][unhandled]', e) } catch {}
    return NextResponse.json({ ok: false, error: e?.message || 'internal_error' }, { status: 500 })
  }
}
