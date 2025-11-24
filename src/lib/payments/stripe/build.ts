import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'

export async function buildStripeClientForMerchant(merchantId: string) {
  const integ = await prisma.merchantIntegration.findUnique({
    where: { merchantId_provider: { merchantId: String(merchantId), provider: 'STRIPE' as any } },
    select: { credentials: true, isActive: true },
  })
  if (!integ || !integ.isActive) throw new Error('stripe_integration_inactive')
  const creds = (integ.credentials || {}) as any
  const secret: string | undefined = creds?.secretKey || process.env.STRIPE_SECRET_KEY
  const apiVersion: any = creds?.apiVersion || '2023-10-16'
  if (!secret) throw new Error('stripe_secret_missing')
  const stripe = new Stripe(secret, { apiVersion })
  return { stripe }
}
