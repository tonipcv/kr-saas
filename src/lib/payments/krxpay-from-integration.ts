import { prisma } from '@/lib/prisma'

export type KrxpayCredentials = {
  apiKey?: string | null
  accountId?: string | null
  webhookSecret?: string | null
}

export async function getKrxpayCredentialsByClinicId(clinicId: string): Promise<KrxpayCredentials | null> {
  const integ = await prisma.merchantIntegration.findFirst({
    where: { clinicId: String(clinicId), provider: 'PAGARME' as any, isActive: true },
    select: { credentials: true },
  }).catch(() => null as any)
  const creds = (integ?.credentials || {}) as any
  const apiKey = typeof creds?.apiKey === 'string' ? creds.apiKey : undefined
  const accountId = typeof creds?.accountId === 'string' ? creds.accountId : undefined
  const webhookSecret = typeof creds?.webhookSecret === 'string' ? creds.webhookSecret : undefined
  if (!apiKey && !accountId && !webhookSecret) return null
  return { apiKey: apiKey || null, accountId: accountId || null, webhookSecret: webhookSecret || null }
}

export async function getKrxpayCredentialsByMerchantId(merchantId: string): Promise<KrxpayCredentials | null> {
  const integ = await prisma.merchantIntegration.findFirst({
    where: { merchantId: String(merchantId), provider: 'PAGARME' as any, isActive: true },
    select: { credentials: true },
  }).catch(() => null as any)
  const creds = (integ?.credentials || {}) as any
  const apiKey = typeof creds?.apiKey === 'string' ? creds.apiKey : undefined
  const accountId = typeof creds?.accountId === 'string' ? creds.accountId : undefined
  const webhookSecret = typeof creds?.webhookSecret === 'string' ? creds.webhookSecret : undefined
  if (!apiKey && !accountId && !webhookSecret) return null
  return { apiKey: apiKey || null, accountId: accountId || null, webhookSecret: webhookSecret || null }
}
