import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'

export type StripeFromIntegration = {
  stripe: Stripe
}

// Resolve Stripe client using the merchant/clinic saved integration secret (never from env)
export async function getStripeFromClinicIntegration(clinicId: string): Promise<StripeFromIntegration> {
  const clinic = await prisma.clinic.findUnique({ where: { id: String(clinicId) }, select: { id: true } })
  if (!clinic) throw new Error('Clinic not found')
  const merchant = await prisma.merchant.findUnique({ where: { clinicId: String(clinicId) }, select: { id: true } })
  if (!merchant) throw new Error('Merchant not found for clinic')
  const integ = await prisma.merchantIntegration.findUnique({
    where: { merchantId_provider: { merchantId: merchant.id, provider: 'STRIPE' as any } },
    select: { isActive: true, credentials: true },
  })
  if (!integ?.isActive) throw new Error('Stripe integration is not active for clinic')
  const creds = (integ.credentials || {}) as any
  const apiKey = String(creds?.apiKey || '')
  if (!apiKey) throw new Error('Stripe secret key not found on clinic integration')
  const stripe = new Stripe(apiKey, { apiVersion: '2023-10-16' })
  return { stripe }
}
