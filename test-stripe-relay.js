// test-stripe-relay.js
// Stripe via Evervault Relay smoke test

const APP_ID = process.env.VAULT_APP_ID;
const API_KEY = process.env.EVERVAULT_API_KEY;
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY; // set sk_test_... in env

// URL do seu Relay (copiada do dashboard)
const STRIPE_RELAY = 'https://api-stripe-com-app-05f835b19807.relay.evervault.app';

async function testStripePayment() {
  if (!global.ENCRYPTED_CARD) throw new Error('Encrypted card not generated');
  if (!STRIPE_KEY || !STRIPE_KEY.startsWith('sk_test_')) throw new Error('Missing STRIPE_SECRET_KEY (sk_test_...) in env');
  if (!APP_ID || !API_KEY) throw new Error('Missing VAULT_APP_ID / EVERVAULT_API_KEY');

  const cardTokens = {
    number: global.ENCRYPTED_CARD.number,
    expMonth: global.ENCRYPTED_CARD.expiry.month,
    expYear: global.ENCRYPTED_CARD.expiry.year,
    cvc: global.ENCRYPTED_CARD.cvc,
  };

  console.log('[test] Processando pagamento de R$ 10,00 via Stripe Relay...');
  console.log('[info] Enviando tokens criptografados para o Relay...');
  console.log('[debug] Payload sendo enviado:');
  console.log('  number:', (cardTokens.number || '').substring(0, 30) + '...');
  console.log('  exp_month:', cardTokens.expMonth);
  console.log('  exp_year:', cardTokens.expYear);
  console.log('  cvc:', (cardTokens.cvc || '').substring(0, 30) + '...');

  // Attempt A: source[...] shape
  const bodyA = new URLSearchParams({
    amount: String(1000),
    currency: 'brl',
    'source[object]': 'card',
    'source[number]': cardTokens.number,
    'source[exp_month]': cardTokens.expMonth,
    'source[exp_year]': cardTokens.expYear,
    'source[cvc]': cardTokens.cvc,
  });
  let response = await fetch(`${STRIPE_RELAY}/v1/charges`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Evervault-App-Id': APP_ID,
      'X-Evervault-Api-Key': API_KEY,
    },
    body: bodyA,
  });
  let result = await response.json();
  if (!response.ok) {
    console.warn('[warn] Attempt A (source[...]) failed:', JSON.stringify(result, null, 2));

    // Attempt B: card[...] shape
    const bodyB = new URLSearchParams({
      amount: String(1000),
      currency: 'brl',
      'card[number]': cardTokens.number,
      'card[exp_month]': cardTokens.expMonth,
      'card[exp_year]': cardTokens.expYear,
      'card[cvc]': cardTokens.cvc,
    });
    response = await fetch(`${STRIPE_RELAY}/v1/charges`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Evervault-App-Id': APP_ID,
        'X-Evervault-Api-Key': API_KEY,
      },
      body: bodyB,
    });
    result = await response.json();
    if (!response.ok) {
      console.error('[error] Attempt B (card[...]) failed:', JSON.stringify(result, null, 2));
      throw new Error(result.error?.message || 'Stripe payment failed');
    }
  }

  console.log('\n✅ PAGAMENTO APROVADO!');
  console.log('═══════════════════════════════════════');
  console.log('Transaction ID:', result.id);
  console.log('Status:', result.status);
  console.log('Valor:', `R$ ${(result.amount / 100).toFixed(2)}`);
  console.log('Moeda:', result.currency.toUpperCase());
  console.log('Cartão (últimos 4):', result.source?.last4 || 'N/A');
  console.log('Bandeira:', result.source?.brand || 'N/A');
  console.log('═══════════════════════════════════════\n');
  return result;
}

async function generateTokens() {
  const RAW_PAN = process.env.RAW_PAN;
  const EXP_MONTH = process.env.EV_EXP_MONTH;
  const EXP_YEAR = process.env.EV_EXP_YEAR;
  const RAW_CVC = process.env.RAW_CVC;
  if (!RAW_PAN || !EXP_MONTH || !EXP_YEAR) throw new Error('Faltam variáveis de ambiente RAW_PAN / EV_EXP_MONTH / EV_EXP_YEAR');
  const mod = await import('@evervault/sdk');
  const SDK = mod.default || mod;
  const ev = new SDK(APP_ID, API_KEY);
  const twoDigitYear = String(EXP_YEAR).slice(-2);
  const cardData = {
    number: RAW_PAN,
    expiry: { month: String(EXP_MONTH).padStart(2, '0'), year: twoDigitYear },
    cvc: RAW_CVC || '123',
  };
  const encrypted = await ev.encrypt(cardData);
  global.ENCRYPTED_CARD = encrypted;
  console.log('[ok] Tokens criptografados gerados');
  console.log('[info] Número:', encrypted.number.substring(0, 24) + '...');
}

(async () => {
  try {
    await generateTokens();
    await testStripePayment();
  } catch (e) {
    console.error('[error]', e?.message || e);
    process.exit(1);
  }
})();
