import { NextRequest, NextResponse } from 'next/server'
import { VaultManager } from '@/lib/payments/vault/manager'
import { z } from 'zod'

const ChargeSchema = z.object({
  customerId: z.string(),
  savedCardId: z.string(),
  amountCents: z.number().positive(),
  currency: z.string().default('BRL'),
  description: z.string().optional(),
  metadata: z.record(z.any()).optional()
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const validated = ChargeSchema.parse(body)
    
    const vaultManager = new VaultManager()
    const transaction = await vaultManager.charge({
      customerId: validated.customerId,
      savedCardId: validated.savedCardId,
      amountCents: validated.amountCents,
      currency: validated.currency,
      description: validated.description || 'Cobrança',
      metadata: validated.metadata
    })
    
    return NextResponse.json({
      ok: true,
      data: {
        transactionId: transaction.id,
        status: transaction.status,
        status_v2: transaction.status_v2,
        paidAt: transaction.paidAt
      }
    })
  } catch (e: any) {
    console.error('[charge] error', e)
    return NextResponse.json({ ok: false, error: e?.message || 'Internal error' }, { status: 500 })
  }
}
