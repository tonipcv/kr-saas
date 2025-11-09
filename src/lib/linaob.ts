// Normalize provider base URL: strip trailing /api/v1 if present to prevent double /api/v1/api/v1
const BASE_URL = (process.env.LINAOB_BASE_URL || '').replace(/\/api\/v1\/?$/i, '');
const TOKEN_URL = process.env.LINAOB_OAUTH_TOKEN_URL || 'https://iam.hml.linaob.com.br/realms/ob-epp/protocol/openid-connect/token';
const CLIENT_ID = process.env.LINAOB_CLIENT_ID || 'lys-metaverse';
const CLIENT_SECRET = process.env.LINAOB_CLIENT_SECRET || '';

let _token: string | null = null;
let _tokenExpiresAt = 0; // epoch ms

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (_token && now < _tokenExpiresAt - 5000) {
    return _token;
  }
  const body = new URLSearchParams();
  body.set('grant_type', 'client_credentials');
  body.set('client_id', CLIENT_ID);
  body.set('client_secret', CLIENT_SECRET);
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    cache: 'no-store',
  });
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) {
    const msg = data?.error_description || data?.error || text || `OAuth token error ${res.status}`;
    const err: any = new Error(msg);
    err.status = res.status; err.responseText = text; err.responseJson = data;
    throw err;
  }
  const access = String(data?.access_token || '');
  if (!access) throw new Error('OAuth response missing access_token');
  const expiresIn = Number(data?.expires_in || 0) || 3600;
  _token = access;
  _tokenExpiresAt = Date.now() + expiresIn * 1000;
  return _token;
}

type CallOpts = { subTenantId?: string; clientIp?: string };

async function authHeaders(opts?: CallOpts) {
  const token = await getAccessToken();
  const h: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const sub = opts?.subTenantId || process.env.LINAOB_SUBTENANT_ID || undefined;
  const ip = opts?.clientIp || undefined;
  if (sub) h['subTenantId'] = sub;
  if (ip) h['x-client-ip'] = ip;
  return h;
}

export async function listParticipantsRegistered(opts?: CallOpts) {
  // First try without /api/v1, then fallback to /api/v1 for backward compatibility
  const primary = `${BASE_URL}/open-integration/participants/registered`;
  let res = await fetch(primary, { method: 'GET', headers: await authHeaders(opts), cache: 'no-store' });
  let text = await res.text();
  let data: any = {}; try { data = JSON.parse(text); } catch {}
  if (!res.ok && res.status === 404) {
    const alt = `${BASE_URL}/api/v1/open-integration/participants/registered`;
    res = await fetch(alt, { method: 'GET', headers: await authHeaders(opts), cache: 'no-store' });
    text = await res.text(); data = {}; try { data = JSON.parse(text); } catch {}
  }
  if (!res.ok) {
    const msg = data?.message || data?.error || text || `Lina OB error ${res.status}`;
    const err: any = new Error(msg);
    err.status = res.status; err.responseText = text; err.responseJson = data;
    throw err;
  }
  return data;
}

export async function getEnrollmentByUser(cpf: string, deviceId?: string, opts?: CallOpts) {
  const qp = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : '';
  const url = `${BASE_URL}/api/v1/jsr/enrollments/users/${encodeURIComponent(cpf)}${qp}`;
  const res = await fetch(url, { method: 'GET', headers: await authHeaders(opts), cache: 'no-store' });
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) {
    const msg = data?.message || data?.error || text || `Lina OB error ${res.status}`;
    const err: any = new Error(msg);
    err.status = res.status; err.responseText = text; err.responseJson = data;
    throw err;
  }
  return data;
}

export async function postEnrollmentDeviceOptions(payload: Record<string, any>, opts?: CallOpts) {
  const url = `${BASE_URL}/api/v1/jsr/enrollments/device/options`;
  // Note: provider requires x-client-ip header; pass via opts.clientIp
  const res = await fetch(url, { method: 'POST', headers: await authHeaders(opts), body: JSON.stringify(payload), cache: 'no-store' });
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) {
    const msg = data?.message || data?.error || text || `Lina OB error ${res.status}`;
    const err: any = new Error(msg);
    err.status = res.status; err.responseText = text; err.responseJson = data;
    throw err;
  }
  return data;
}

export async function createEnrollment(payload: Record<string, any>, opts?: CallOpts) {
  const url = `${BASE_URL}/api/v1/jsr/enrollments`;
  const maxAttempts = 4;
  let attempt = 0;
  while (true) {
    attempt += 1;
    const res = await fetch(url, { method: 'POST', headers: await authHeaders(opts), body: JSON.stringify(payload), cache: 'no-store' });
    const text = await res.text();
    let data: any = {}; try { data = JSON.parse(text); } catch {}
    if (res.ok) return data;
    const status = res.status;
    const providerCode = data?.errors?.[0]?.code || data?.code;
    const shouldRetry = status === 424 || status === 429 || String(providerCode) === '429' || /429/.test(String(data?.message || text));
    if (shouldRetry && attempt < maxAttempts) {
      const waitMs = 500 * attempt; // linear backoff
      // eslint-disable-next-line no-console
      console.warn('[linaob.createEnrollment][retry]', { attempt, status, providerCode, waitMs });
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }
    const msg = data?.message || data?.error || text || `Lina OB error ${status}`;
    const err: any = new Error(msg);
    err.status = status; err.responseText = text; err.responseJson = data;
    throw err;
  }
}

export async function getEnrollment(enrollmentId: string, opts?: CallOpts) {
  const url = `${BASE_URL}/api/v1/jsr/enrollments/${encodeURIComponent(enrollmentId)}`;
  const res = await fetch(url, { method: 'GET', headers: await authHeaders(opts), cache: 'no-store' });
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) {
    const msg = data?.message || data?.error || text || `Lina OB error ${res.status}`;
    const err: any = new Error(msg);
    err.status = res.status; err.responseText = text; err.responseJson = data;
    throw err;
  }
  return data;
}

export async function postEnrollmentDevice(payload: Record<string, any>, opts?: CallOpts) {
  const url = `${BASE_URL}/api/v1/jsr/enrollments/device`;
  const res = await fetch(url, { method: 'POST', headers: await authHeaders(opts), body: JSON.stringify(payload), cache: 'no-store' });
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) {
    const msg = data?.message || data?.error || text || `Lina OB error ${res.status}`;
    const err: any = new Error(msg);
    err.status = res.status; err.responseText = text; err.responseJson = data;
    throw err;
  }
  return data;
}

export async function postEnrollmentDeviceForEnrollment(enrollmentId: string, payload: Record<string, any>, opts?: CallOpts) {
  const url = `${BASE_URL}/api/v1/jsr/enrollments/${encodeURIComponent(enrollmentId)}/device`;
  const res = await fetch(url, { method: 'POST', headers: await authHeaders(opts), body: JSON.stringify(payload), cache: 'no-store' });
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) {
    const msg = data?.message || data?.error || text || `Lina OB error ${res.status}`;
    const err: any = new Error(msg);
    err.status = res.status; err.responseText = text; err.responseJson = data;
    throw err;
  }
  return data;
}

export async function createRecurringConsent(payload: Record<string, any>, opts?: CallOpts) {
  const url = `${BASE_URL}/automatic-payments/recurring-consents`;
  const res = await fetch(url, { method: 'POST', headers: await authHeaders(opts), body: JSON.stringify(payload), cache: 'no-store' });
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) {
    const msg = data?.message || data?.error || text || `Lina OB error ${res.status}`;
    const err: any = new Error(msg);
    err.status = res.status; err.responseText = text; err.responseJson = data;
    throw err;
  }
  return data;
}

export async function createRecurringPayment(payload: Record<string, any>, opts?: CallOpts) {
  const url = `${BASE_URL}/automatic-payments/recurring-payments`;
  const res = await fetch(url, { method: 'POST', headers: await authHeaders(opts), body: JSON.stringify(payload), cache: 'no-store' });
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) {
    const msg = data?.message || data?.error || text || `Lina OB error ${res.status}`;
    const err: any = new Error(msg);
    err.status = res.status; err.responseText = text; err.responseJson = data;
    throw err;
  }
  return data;
}

// JSR-style endpoints (per cURL reference)
export async function createJSRConsent(payload: Record<string, any>, opts?: CallOpts) {
  const url = `${BASE_URL}/api/v1/jsr/consents`;
  const res = await fetch(url, { method: 'POST', headers: await authHeaders(opts), body: JSON.stringify(payload), cache: 'no-store' });
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) {
    const msg = data?.message || data?.error || text || `Lina OB error ${res.status}`;
    const err: any = new Error(msg);
    err.status = res.status; err.responseText = text; err.responseJson = data;
    throw err;
  }
  return data;
}

export async function createJSRPayment(payload: Record<string, any>, opts?: CallOpts) {
  const url = `${BASE_URL}/api/v1/jsr/payments`;
  const res = await fetch(url, { method: 'POST', headers: await authHeaders(opts), body: JSON.stringify(payload), cache: 'no-store' });
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) {
    const msg = data?.message || data?.error || text || `Lina OB error ${res.status}`;
    const err: any = new Error(msg);
    err.status = res.status; err.responseText = text; err.responseJson = data;
    throw err;
  }
  return data;
}

// Redirect-based single payment helpers (provider-specific names may vary)
export async function createRedirectPayment(payload: Record<string, any>, opts?: CallOpts) {
  const url = `${BASE_URL}/api/v1/payments`;
  try { console.log('🌐 [linaob] Chamando:', { url, subTenantId: opts?.subTenantId, hasClientIp: !!opts?.clientIp }); } catch {}
  try { console.log('🔎 [linaob] Payload:', JSON.stringify(payload, null, 2)); } catch {}
  const res = await fetch(url, { method: 'POST', headers: await authHeaders(opts), body: JSON.stringify(payload), cache: 'no-store' });
  const text = await res.text();
  try { console.log('📡 [linaob] Resposta:', { status: res.status, ok: res.ok, preview: text.slice(0, 500) }); } catch {}
  let data: any = {};
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) {
    const msg = data?.message || data?.error || text || `Lina OB error ${res.status}`;
    const err: any = new Error(msg);
    err.status = res.status; err.responseText = text; err.responseJson = data;
    throw err;
  }
  return data;
}

export async function getPaymentRequest(paymentRequestId: string, opts?: CallOpts) {
  const url = `${BASE_URL}/api/v1/payments/requests/${encodeURIComponent(paymentRequestId)}`;
  const res = await fetch(url, { method: 'GET', headers: await authHeaders(opts), cache: 'no-store' });
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) {
    const msg = data?.message || data?.error || text || `Lina OB error ${res.status}`;
    const err: any = new Error(msg);
    err.status = res.status; err.responseText = text; err.responseJson = data;
    throw err;
  }
  return data;
}
