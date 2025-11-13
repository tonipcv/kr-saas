import Stripe from 'stripe'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export type StripeClientContext = {
  stripe: Stripe
  accountId: string | null
}

export async function getStripeClientForCurrentDoctor(): Promise<StripeClientContext> {
  const secret = String(process.env.STRIPE_SECRET_KEY || '')
  if (!secret) throw new Error('Stripe secret key is not configured')
  const stripe = new Stripe(secret, { apiVersion: '2023-10-16' })
  try {
    const session = await getServerSession(authOptions)
    const uid = session?.user?.id
    if (!uid) return { stripe, accountId: null }
    const user = await prisma.user.findUnique({ where: { id: uid }, select: { role: true, stripe_connect_id: true } })
    const accountId = user?.stripe_connect_id || null
    return { stripe, accountId }
  } catch {
    return { stripe, accountId: null }
  }
}
