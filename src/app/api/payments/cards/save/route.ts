import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { VaultManager } from '@/lib/payments/vault/manager'
import { z } from 'zod'

const SaveCardSchema = z.object({
  userId: z.string(),
  slug: z.string(),
  provider: z.enum(['STRIPE', 'PAGARME', 'APPMAX']),
  token: z.string(), // pm_xxx, card_xxx, tok_xxx
  brand: z.string().optional(),
  last4: z.string().optional(),
  expMonth: z.number().optional(),
  expYear: z.number().optional(),
  setAsDefault: z.boolean().optional()
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const validated = SaveCardSchema.parse(body)
    
    // Resolver clinic e merchant
    const clinic = await prisma.clinic.findFirst({ where: { slug: validated.slug } })
    if (!clinic) {
      return NextResponse.json({ ok: false, error: 'Business not found' }, { status: 404 })
    }
    
    const merchant = await prisma.merchant.findFirst({ where: { clinicId: clinic.id } })
    if (!merchant) {
      return NextResponse.json({ ok: false, error: 'Merchant not found' }, { status: 404 })
    }
    
    // Resolver user email
    const user = await prisma.user.findUnique({ where: { id: validated.userId } })
    if (!user?.email) {
      return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 })
    }
    
    // Buscar ou criar customer unificado
    let customer = await prisma.customer.findFirst({
      where: { merchantId: merchant.id, email: user.email }
    })
    
    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          merchantId: merchant.id,
          email: user.email,
          name: user.name || user.email
        }
      })
    }
    
    // Salvar cartão via VaultManager
    const vaultManager = new VaultManager()
    const savedCard = await vaultManager.saveCard({
      customerId: customer.id,
      provider: validated.provider,
      token: validated.token,
      accountId: merchant.id,
      brand: validated.brand || null,
      last4: validated.last4 || null,
      expMonth: validated.expMonth || null,
      expYear: validated.expYear || null,
      setAsDefault: validated.setAsDefault || false
    })
    
    return NextResponse.json({ ok: true, data: { cardId: savedCard.id } })
  } catch (e: any) {
    console.error('[save-card] error', e)
    return NextResponse.json({ ok: false, error: e?.message || 'Internal error' }, { status: 500 })
  }
}
