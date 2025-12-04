// test-evervault.js
// Evervault API smoke test: BIN Lookup, Inspect, and Create Card (vault)

const APP_ID = process.env.VAULT_APP_ID || process.env.EVERVAULT_APP_ID;
const API_KEY = process.env.EVERVAULT_API_KEY;
let EV_TOKEN = process.env.EV_TOKEN; // Evervault card token for /inspect and /payments/cards
const EXP_MONTH = process.env.EV_EXP_MONTH; // e.g. "12"
const EXP_YEAR = process.env.EV_EXP_YEAR;   // e.g. "2027" or "27"
const RAW_PAN = process.env.RAW_PAN;        // optional: raw PAN to generate EV_TOKEN via Evervault SDK
const RAW_CVC = process.env.RAW_CVC;        // optional: raw CVC (not required for token, but useful for future tests)

if (!APP_ID || !API_KEY) {
  console.error('Missing VAULT_APP_ID/EVERVAULT_APP_ID or EVERVAULT_API_KEY in env');
  process.exit(1);
}

const BASE = 'https://api.evervault.com';

function authHeader() {
  const creds = Buffer.from(`${APP_ID}:${API_KEY}`).toString('base64');
  return `Basic ${creds}`;
}

async function evRequest(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Authorization': authHeader(),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    const title = data?.title || data?.detail || data?.message || text || 'Unknown error';
    const meta = typeof data === 'object' ? ` | body=${JSON.stringify(data)}` : '';
    throw new Error(`Evervault API error ${res.status}: ${title}${meta}`);
  }
  return data;
}

async function testBinLookup() {
  const BIN = process.env.TEST_BIN || '411111';
  console.log('[test] BIN Lookup =>', BIN);
  const resp = await evRequest('POST', '/payments/bin-lookups', { number: BIN });
  console.log('[ok][bin-lookup] response:', JSON.stringify(resp, null, 2));
}

async function testInspect() {
  if (!EV_TOKEN) {
    console.log('[skip][inspect] set EV_TOKEN env to test /inspect');
    return;
  }
  console.log('[test] Inspect => token present (masked)');
  const resp = await evRequest('POST', '/inspect', { token: EV_TOKEN });
  console.log('[ok][inspect] response:', JSON.stringify(resp, null, 2));
}

function normalizeYear(y) {
  const yr = Number(y);
  return yr < 100 ? (2000 + yr) : yr;
}

async function testCreateCard() {
  if (!global.ENCRYPTED_CARD) {
    console.log('[skip][create-card] encrypted card data not available');
    return;
  }
  const encrypted = global.ENCRYPTED_CARD;
  // Card Account Updater: expects expiry as nested object and typically no cvc
  const payload = {
    number: encrypted.number,
    expiry: { month: encrypted?.expiry?.month, year: encrypted?.expiry?.year },
  };
  console.log('[test] Create Card payload =>', JSON.stringify(payload, null, 2));
  const resp = await evRequest('POST', '/payments/cards', payload);
  console.log('[ok][create-card] response:', JSON.stringify(resp, null, 2));
}

async function maybeGenerateTokenFromRawPan() {
  if (!RAW_PAN) return;
  try {
    // If RAW_PAN is provided, prefer generating a fresh token and override any pre-set EV_TOKEN
    const mod = await import('evervault').catch(async () => {
      try { return await import('@evervault/sdk'); } catch { return null; }
    });
    const SDK = mod && (mod.default || mod);
    if (!SDK) {
      console.log('[hint] Evervault SDK not installed. To generate EV_TOKEN from RAW_PAN run: npm i evervault');
      return;
    }
    const ev = new SDK(APP_ID, API_KEY);
    const twoDigitYear = String(normalizeYear(EXP_YEAR || '2027')).slice(-2);
    const cardData = {
      number: RAW_PAN,
      expiry: { month: String(EXP_MONTH || '12').padStart(2, '0'), year: twoDigitYear },
      // cvc intentionally present for encryption completeness, but will not be sent to /payments/cards
      cvc: RAW_CVC || '123',
    };
    const encrypted = await ev.encrypt(cardData);
    // Store full encrypted card object to use in /payments/cards (expects number, expiry.month/year, cvc as tokens)
    global.ENCRYPTED_CARD = encrypted;
    const tok = (encrypted && typeof encrypted === 'object') ? (encrypted.number || encrypted.token || encrypted.card || '') : String(encrypted || '');
    if (typeof tok === 'string' && tok.startsWith('ev:')) {
      EV_TOKEN = tok;
      console.log('[ok][tokenize] generated EV_TOKEN from RAW_PAN via Evervault SDK');
    } else {
      console.log('[warn][tokenize] SDK did not return an Evervault token string');
    }
  } catch (e) {
    console.log('[warn][tokenize] failed to generate EV_TOKEN from RAW_PAN:', e?.message || e);
  }
}

(async () => {
  try {
    await maybeGenerateTokenFromRawPan();
    await testBinLookup();
    await testInspect();
    await testCreateCard();
  } catch (e) {
    console.error('[error]', e?.message || e);
    process.exit(1);
  }
})();
