import crypto from 'crypto';

const PAGARME_API_KEY = process.env.PAGARME_API_KEY || '';
const PAGARME_BASE_URL = process.env.PAGARME_BASE_URL || 'https://api.pagar.me/1';
const PAGARME_WEBHOOK_SECRET = process.env.PAGARME_WEBHOOK_SECRET || '';

function authHeaders() {
  // Depending on Pagar.me API version, it can be Basic or Bearer.
  // Here we use Basic with api_key as user and empty password: base64("api_key:")
  const token = Buffer.from(`${PAGARME_API_KEY}:`).toString('base64');
  return {
    Authorization: `Basic ${token}`,
    'Content-Type': 'application/json',
  } as Record<string, string>;
}

export async function pagarmeCreateBankAccount(payload: Record<string, any>) {
  const res = await fetch(`${PAGARME_BASE_URL}/bank_accounts`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.errors?.[0]?.message || data?.error || `Pagar.me error ${res.status}`);
  return data;
}

export async function pagarmeCreateRecipient(payload: Record<string, any>) {
  const res = await fetch(`${PAGARME_BASE_URL}/recipients`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.errors?.[0]?.message || data?.error || `Pagar.me error ${res.status}`);
  return data;
}

export async function pagarmeUpdateRecipient(recipientId: string, payload: Record<string, any>) {
  const res = await fetch(`${PAGARME_BASE_URL}/recipients/${encodeURIComponent(recipientId)}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.errors?.[0]?.message || data?.error || `Pagar.me error ${res.status}`);
  return data;
}

export async function pagarmeGetRecipient(recipientId: string) {
  const res = await fetch(`${PAGARME_BASE_URL}/recipients/${encodeURIComponent(recipientId)}`, {
    method: 'GET',
    headers: authHeaders(),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.errors?.[0]?.message || data?.error || `Pagar.me error ${res.status}`);
  return data;
}

export function verifyPagarmeWebhookSignature(rawBody: string, signatureHeader: string | undefined): boolean {
  if (!PAGARME_WEBHOOK_SECRET) return false;
  if (!signatureHeader) return false;
  // Some Pagar.me versions use HMAC-SHA1 or SHA256. We'll assume SHA256 for modern setups.
  const computed = crypto.createHmac('sha256', PAGARME_WEBHOOK_SECRET).update(rawBody, 'utf8').digest('hex');
  // Signature header may be like: sha256=xxx
  const received = signatureHeader.split('=')[1] || signatureHeader;
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(received));
}

export async function pagarmeGetOrder(orderId: string) {
  console.log(`[pagarme] Getting order ${orderId}`);
  const res = await fetch(`${PAGARME_BASE_URL}/orders/${encodeURIComponent(orderId)}`, {
    method: 'GET',
    headers: authHeaders(),
    cache: 'no-store',
  });
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    console.error(`[pagarme] Error getting order ${orderId}:`, errorData);
    throw new Error(errorData?.errors?.[0]?.message || errorData?.error || `Pagar.me error ${res.status}`);
  }
  
  const data = await res.json().catch(() => ({}));
  console.log(`[pagarme] Order ${orderId} data:`, JSON.stringify(data));
  return data;
}

export function isV5() {
  // Check if we're using Pagar.me API v5 (core)
  return PAGARME_BASE_URL?.includes('api.pagar.me/core');
}

export type MerchantStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'DISABLED';

export type MerchantIntegrationStatus = {
  connected: boolean;
  status: MerchantStatus;
  recipientId: string | null;
  splitPercent: number;
  platformFeeBps: number;
  lastSyncAt: string | null;
};
