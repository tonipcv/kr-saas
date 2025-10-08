import crypto from 'crypto';

const PAGARME_API_KEY = process.env.PAGARME_API_KEY || '';
const PAGARME_BASE_URL = process.env.PAGARME_BASE_URL || 'https://api.pagar.me/1';
const PAGARME_WEBHOOK_SECRET = process.env.PAGARME_WEBHOOK_SECRET || '';
const IS_V5 = PAGARME_BASE_URL.includes('/core/v5');
const AUTH_SCHEME = (process.env.PAGARME_AUTH_SCHEME || 'basic').toLowerCase(); // 'basic' | 'bearer'
const PAGARME_ACCOUNT_ID = process.env.PAGARME_ACCOUNT_ID || '';
export function isV5() { return IS_V5; }

// ===== v5 Customers & Cards helpers =====

export async function pagarmeCreateCustomer(payload: Record<string, any>) {
  const res = await fetch(`${PAGARME_BASE_URL}/customers`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) {
    const msgFromArray = Array.isArray(data?.errors)
      ? data.errors.map((e: any) => e?.message || e?.code || JSON.stringify(e)).join(' | ')
      : undefined;
    const msg = msgFromArray || data?.message || data?.error || text || `Pagarme error ${res.status}`;
    const err: any = new Error(`[Pagarme ${res.status}] ${msg}`);
    err.status = res.status;
    err.responseText = text;
    err.responseJson = data;
    throw err;
  }
  return data;
}

export async function pagarmeCreateCustomerCard(customerId: string, payload: Record<string, any>) {
  const res = await fetch(`${PAGARME_BASE_URL}/customers/${encodeURIComponent(customerId)}/cards`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) {
    const msgFromArray = Array.isArray(data?.errors)
      ? data.errors.map((e: any) => e?.message || e?.code || JSON.stringify(e)).join(' | ')
      : undefined;
    const msg = msgFromArray || data?.message || data?.error || text || `Pagarme error ${res.status}`;
    const err: any = new Error(`[Pagarme ${res.status}] ${msg}`);
    err.status = res.status;
    err.responseText = text;
    err.responseJson = data;
    throw err;
  }
  return data;
}

export async function pagarmeGetOrder(orderId: string) {
  const res = await fetch(`${PAGARME_BASE_URL}/orders/${encodeURIComponent(orderId)}`, {
    method: 'GET',
    headers: authHeaders(),
    cache: 'no-store',
  });
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) {
    const msgFromArray = Array.isArray(data?.errors)
      ? data.errors.map((e: any) => e?.message || e?.code || JSON.stringify(e)).join(' | ')
      : undefined;
    const msg = msgFromArray || data?.message || data?.error || text || `Pagarme error ${res.status}`;
    const err: any = new Error(`[Pagarme ${res.status}] ${msg}`);
    err.status = res.status;
    err.responseText = text;
    err.responseJson = data;
    throw err;
  }
  return data;
}

function authHeaders() {
  if (AUTH_SCHEME === 'bearer') {
    const h: Record<string, string> = {
      Authorization: `Bearer ${PAGARME_API_KEY}`,
      'Content-Type': 'application/json',
    };
    if (PAGARME_ACCOUNT_ID) h['X-PagarMe-Account-Id'] = PAGARME_ACCOUNT_ID;
    return h;
  }
  // Default: Basic (api_key as username, empty password)
  const token = Buffer.from(`${PAGARME_API_KEY}:`).toString('base64');
  const h: Record<string, string> = {
    Authorization: `Basic ${token}`,
    'Content-Type': 'application/json',
  };
  if (PAGARME_ACCOUNT_ID) h['X-PagarMe-Account-Id'] = PAGARME_ACCOUNT_ID;
  return h;
}

export async function pagarmeCreateBankAccount(payload: Record<string, any>) {
  const res = await fetch(`${PAGARME_BASE_URL}/bank_accounts`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) throw new Error(data?.errors?.[0]?.message || data?.error || text || `Pagar.me error ${res.status}`);
  return data;
}

export async function pagarmeCreateRecipient(payload: Record<string, any>) {
  // v5 and v1 both use /recipients, but body shape differs; caller is responsible for shaping payload
  const res = await fetch(`${PAGARME_BASE_URL}/recipients`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) {
    const msgFromArray = Array.isArray(data?.errors)
      ? data.errors.map((e: any) => e?.message || e?.code || JSON.stringify(e)).join(' | ')
      : undefined;
    const msg = msgFromArray || data?.message || data?.error || text || `Pagarme error ${res.status}`;
    const err: any = new Error(`[Pagarme ${res.status}] ${msg}`);
    err.status = res.status;
    err.responseText = text;
    err.responseJson = data;
    throw err;
  }
  return data;
}

export async function pagarmeUpdateRecipient(recipientId: string, payload: Record<string, any>) {
  const res = await fetch(`${PAGARME_BASE_URL}/recipients/${encodeURIComponent(recipientId)}`, {
    method: IS_V5 ? 'PATCH' : 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) {
    const msgFromArray = Array.isArray(data?.errors)
      ? data.errors.map((e: any) => e?.message || e?.code || JSON.stringify(e)).join(' | ')
      : undefined;
    const msg = msgFromArray || data?.message || data?.error || text || `Pagarme error ${res.status}`;
    throw new Error(`[Pagarme ${res.status}] ${msg}`);
  }
  return data;
}

export async function pagarmeGetRecipient(recipientId: string) {
  const res = await fetch(`${PAGARME_BASE_URL}/recipients/${encodeURIComponent(recipientId)}`, {
    method: 'GET',
    headers: authHeaders(),
    cache: 'no-store',
  });
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) {
    const msgFromArray = Array.isArray(data?.errors)
      ? data.errors.map((e: any) => e?.message || e?.code || JSON.stringify(e)).join(' | ')
      : undefined;
    const msg = msgFromArray || data?.message || data?.error || text || `Pagarme error ${res.status}`;
    throw new Error(`[Pagarme ${res.status}] ${msg}`);
  }
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

export type MerchantStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'DISABLED';

export type MerchantIntegrationStatus = {
  connected: boolean;
  status: MerchantStatus;
  recipientId: string | null;
  splitPercent: number;
  platformFeeBps: number;
  lastSyncAt: string | null;
};

export async function pagarmeCreateOrder(payload: Record<string, any>) {
  const res = await fetch(`${PAGARME_BASE_URL}/orders`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) {
    const msgFromArray = Array.isArray(data?.errors)
      ? data.errors.map((e: any) => e?.message || e?.code || JSON.stringify(e)).join(' | ')
      : undefined;
    const msg = msgFromArray || data?.message || data?.error || text || `Pagarme error ${res.status}`;
    const err: any = new Error(`[Pagarme ${res.status}] ${msg}`);
    err.status = res.status;
    err.responseText = text;
    err.responseJson = data;
    throw err;
  }
  return data;
}
