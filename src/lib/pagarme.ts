import crypto from 'crypto';

const PAGARME_API_KEY = process.env.PAGARME_API_KEY || '';
const PAGARME_BASE_URL = process.env.PAGARME_BASE_URL || 'https://api.pagar.me/1';
const PAGARME_WEBHOOK_SECRET = process.env.PAGARME_WEBHOOK_SECRET || '';
const IS_V5 = PAGARME_BASE_URL.includes('/core/v5');
const AUTH_SCHEME = (process.env.PAGARME_AUTH_SCHEME || 'basic').toLowerCase(); // 'basic' | 'bearer'
const PAGARME_ACCOUNT_ID = process.env.PAGARME_ACCOUNT_ID || '';
export function isV5() { return IS_V5; }

export async function pagarmeListSubscriptions(params: Record<string, any> = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    qs.append(k, String(v));
  }
  const url = `${PAGARME_BASE_URL}/subscriptions${qs.toString() ? `?${qs.toString()}` : ''}`;
  const res = await fetch(url, {
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

// ===== Subscriptions (v5) =====
export async function pagarmeCreatePlan(payload: Record<string, any>) {
  // Typical payload:
  // {
  //   name: 'Plano X',
  //   amount: 1000, // cents
  //   interval: 'month',
  //   interval_count: 1,
  //   trial_period_days: 0
  // }
  const res = await fetch(`${PAGARME_BASE_URL}/plans`, {
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

export async function pagarmeCreateSubscription(payload: Record<string, any>) {
  // Typical payload:
  // {
  //   plan_id: 'pln_xxx',
  //   customer: {...}, // or customer_id
  //   payment_method: 'credit_card',
  //   card_id: 'card_xxx' | card: {...},
  //   metadata: { productId, clinicId, buyerEmail }
  // }
  const res = await fetch(`${PAGARME_BASE_URL}/subscriptions`, {
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
  const url = `${PAGARME_BASE_URL}/recipients/${encodeURIComponent(recipientId)}`;
  // Primary attempt: PATCH on v5, PUT on v1
  let method = IS_V5 ? 'PATCH' : 'PUT';
  let res = await fetch(url, {
    method,
    headers: authHeaders(),
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  let text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch {}

  // If v5 rejects PATCH (405/404), fallback to PUT
  if (!res.ok && IS_V5 && (res.status === 405 || res.status === 404)) {
    method = 'PUT';
    res = await fetch(url, {
      method,
      headers: authHeaders(),
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    text = await res.text();
    data = {};
    try { data = JSON.parse(text); } catch {}
  }

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
  const a = Buffer.from(computed);
  const b = Buffer.from(received);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
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

export async function pagarmeCancelCharge(chargeId: string) {
  // Core v5 cancel/refund: DELETE /charges/{charge_id}
  const url = `${PAGARME_BASE_URL}/charges/${encodeURIComponent(chargeId)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: authHeaders(),
    cache: 'no-store',
  });
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) {
    try { console.error('[pagarme][cancel] error', { status: res.status, data }); } catch {}
    const msgFromArray = Array.isArray(data?.errors)
      ? data.errors.map((e: any) => e?.message || e?.code || JSON.stringify(e)).join(' | ')
      : undefined;
    const msg = msgFromArray || data?.message || data?.error || text || `Pagarme cancel error ${res.status}`;
    const err: any = new Error(msg);
    err.status = res.status;
    err.responseText = text;
    err.responseJson = data;
    throw err;
  }
  return data;
}

export async function pagarmeRefundCharge(chargeId: string, amountCents?: number) {
  // Core v5 refunds: POST /charges/{charge_id}/refunds
  const url = `${PAGARME_BASE_URL}/charges/${encodeURIComponent(chargeId)}/refunds`;
  const body: any = {};
  if (Number.isFinite(Number(amountCents)) && Number(amountCents) > 0) body.amount = Math.floor(Number(amountCents));
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) {
    try { console.error('[pagarme][refund] error', { status: res.status, data }); } catch {}
    const msgFromArray = Array.isArray(data?.errors)
      ? data.errors.map((e: any) => e?.message || e?.code || JSON.stringify(e)).join(' | ')
      : undefined;
    const msg = msgFromArray || data?.message || data?.error || text || `Pagarme refund error ${res.status}`;
    const err: any = new Error(msg);
    err.status = res.status;
    err.responseText = text;
    err.responseJson = data;
    throw err;
  }
  return data;
}

export async function pagarmeUpdateCharge(chargeId: string, payload: Record<string, any>) {
  // Core v5: PATCH /charges/{charge_id} to update split, metadata, etc.
  const url = `${PAGARME_BASE_URL}/charges/${encodeURIComponent(chargeId)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) {
    try { console.error('[pagarme][update_charge] error', { status: res.status, data }); } catch {}
    const msgFromArray = Array.isArray(data?.errors)
      ? data.errors.map((e: any) => e?.message || e?.code || JSON.stringify(e)).join(' | ')
      : undefined;
    const msg = msgFromArray || data?.message || data?.error || text || `Pagarme update charge error ${res.status}`;
    throw new Error(msg);
  }
  return data;
}
