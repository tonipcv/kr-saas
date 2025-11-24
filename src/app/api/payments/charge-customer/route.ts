import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { VaultManager } from '@/lib/payments/vault/manager'
import { z } from 'zod'

const ChargeCustomerSchema = z.object({
  patientId: z.string(), // User.id do paciente
  clinicId: z.string(),
  savedCardId: z.string(),
  amountCents: z.number().positive(),
  description: z.string().optional(),
  metadata: z.record(z.any()).optional()
})

/**
 * POST /api/payments/charge-customer
 * Cobra um paciente usando cartão salvo
 * Resolve internamente o Customer unificado (merchantId + email)
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const validated = ChargeCustomerSchema.parse(body)

    // Verificar acesso à clínica
    const clinic = await prisma.clinic.findFirst({
      where: {
        id: validated.clinicId,
        OR: [
          { ownerId: session.user.id },
          { members: { some: { userId: session.user.id, isActive: true } } }
        ]
      },
      select: { id: true, slug: true }
    })

    if (!clinic) {
      return NextResponse.json({ ok: false, error: 'Clinic not found or access denied' }, { status: 403 })
    }

    // Buscar merchant
    const merchant = await prisma.merchant.findFirst({
      where: { clinicId: validated.clinicId },
      select: { id: true }
    })

    if (!merchant) {
      return NextResponse.json({ ok: false, error: 'Merchant not found' }, { status: 404 })
    }

    // Buscar paciente (User)
    const patient = await prisma.user.findUnique({
      where: { id: validated.patientId },
      select: { id: true, email: true, name: true }
    })

    if (!patient?.email) {
      return NextResponse.json({ ok: false, error: 'Patient not found or has no email' }, { status: 404 })
    }

    // Resolver Customer unificado (merchantId + email)
    let customer = await prisma.customer.findFirst({
      where: {
        merchantId: merchant.id,
        email: patient.email
      },
      select: { id: true }
    })

    // Se não existir, criar Customer
    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          merchantId: merchant.id,
          email: patient.email,
          name: patient.name || patient.email
        },
        select: { id: true }
      })
    }

    // Verificar se o cartão pertence a esse customer
    const paymentMethod = await prisma.customerPaymentMethod.findFirst({
      where: {
        id: validated.savedCardId,
        customerId: customer.id,
        status: 'ACTIVE' as any
      }
    })

    if (!paymentMethod) {
      return NextResponse.json({ ok: false, error: 'Payment method not found or inactive' }, { status: 404 })
    }

    // Cobrar via VaultManager
    const vaultManager = new VaultManager()
    const transaction = await vaultManager.charge({
      customerId: customer.id,
      savedCardId: validated.savedCardId,
      amountCents: validated.amountCents,
      currency: 'BRL',
      description: validated.description || `Cobrança - ${patient.name || patient.email}`,
      metadata: {
        ...validated.metadata,
        patientId: validated.patientId,
        clinicId: validated.clinicId,
        chargedBy: session.user.id
      }
    })

    return NextResponse.json({
      ok: true,
      data: {
        transactionId: transaction.id,
        status: transaction.status,
        statusV2: transaction.status_v2,
        amountCents: transaction.amountCents,
        currency: transaction.currency,
        paidAt: transaction.paidAt,
        createdAt: transaction.createdAt
      }
    })
  } catch (e: any) {
    console.error('[charge-customer] error', e)
    
    if (e.name === 'ZodError') {
      return NextResponse.json({ ok: false, error: 'Invalid request data', details: e.errors }, { status: 400 })
    }
    
    return NextResponse.json({ ok: false, error: e?.message || 'Internal error' }, { status: 500 })
  }
}
