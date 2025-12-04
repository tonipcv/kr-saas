// test-appmax-relay.js
// AppMax via Evervault Relay smoke test

const APP_ID = process.env.VAULT_APP_ID;
const API_KEY = process.env.EVERVAULT_API_KEY;
const APPMAX_TOKEN = process.env.APPMAX_TOKEN; // Token de autenticação da AppMax

// URL do Relay (copie do dashboard) - SANDBOX
const APPMAX_RELAY = 'https://homolog-sandboxappmax-com-br-app-05f835b19807.relay.evervault.app';

async function testAppMaxPayment() {
  if (!global.ENCRYPTED_CARD) throw new Error('Encrypted card not generated');
  if (!APPMAX_TOKEN) throw new Error('Missing APPMAX_TOKEN in env');
  if (!APP_ID || !API_KEY) throw new Error('Missing VAULT_APP_ID / EVERVAULT_API_KEY');

  const cardTokens = {
    number: global.ENCRYPTED_CARD.number,
    expirationDate: global.ENCRYPTED_CARD.expirationDate,
    cvc: global.ENCRYPTED_CARD.cvc,
  };

  console.log('[test] Processando pagamento de R$ 10,00 via AppMax Sandbox Relay...');
  console.log('[debug] Tokens criptografados sendo enviados...');
  console.log('  card_number:', (cardTokens.number || '').substring(0, 30) + '...');
  console.log('  card_cvv:', (cardTokens.cvc || '').substring(0, 30) + '...');
  console.log('  card_expiration:', cardTokens.expirationDate);

  // IMPORTANTE: Ajuste este payload conforme a documentação da AppMax
  // A estrutura abaixo é um exemplo - verifique a doc oficial
  const payload = {
    amount: 10.0, // R$ 10,00
    payment_method: 'credit_card',
    card: {
      number: cardTokens.number, // Token criptografado
      cvv: cardTokens.cvc, // Token criptografado
      expiry_date: cardTokens.expirationDate, // Token MMYY
      holder_name: 'TESTE EVERVAULT',
    },
    customer: {
      name: 'Cliente Teste',
      email: 'teste@example.com',
      document: '11111111111', // CPF
      phone: '11999999999',
    },
  };

  console.log('[debug] Payload AppMax (JSON):');
  console.log(
    JSON.stringify(
      {
        ...payload,
        card: {
          ...payload.card,
          number: (payload.card.number || '').substring(0, 30) + '...',
          cvv: (payload.card.cvv || '').substring(0, 30) + '...',
        },
      },
      null,
      2
    )
  );

  // Ajuste o endpoint conforme a documentação da AppMax
  console.log('[debug] Tentando diferentes formatos de Authorization...');

  // Tentativa 1: token direto no header (sem prefixo)
  let response = await fetch(`${APPMAX_RELAY}/api/v1/payments`, {
    method: 'POST',
    headers: {
      Authorization: APPMAX_TOKEN,
      'Content-Type': 'application/json',
      'X-Evervault-App-Id': APP_ID,
      'X-Evervault-Api-Key': API_KEY,
    },
    body: JSON.stringify(payload),
  });
  let result = await response.json();

  if (!response.ok && (result?.message || '').toLowerCase().includes('authorization')) {
    console.log('[warn] Auth formato 1 falhou, tentando formato 2 ("AppMax <token>")...');
    response = await fetch(`${APPMAX_RELAY}/api/v1/payments`, {
      method: 'POST',
      headers: {
        Authorization: `AppMax ${APPMAX_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Evervault-App-Id': APP_ID,
        'X-Evervault-Api-Key': API_KEY,
      },
      body: JSON.stringify(payload),
    });
    result = await response.json();
  }

  if (!response.ok && (result?.message || '').toLowerCase().includes('authorization')) {
    console.log('[warn] Auth formato 2 falhou, tentando formato 3 (query param)...');
    response = await fetch(`${APPMAX_RELAY}/api/v1/payments?token=${encodeURIComponent(APPMAX_TOKEN)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Evervault-App-Id': APP_ID,
        'X-Evervault-Api-Key': API_KEY,
      },
      body: JSON.stringify(payload),
    });
    result = await response.json();
  }

  if (!response.ok) {
    console.error('[error] AppMax retornou erro:', JSON.stringify(result, null, 2));
    console.log('\n[info] Possíveis ações:');
    console.log('- Verifique formato de autenticação esperado na doc da AppMax');
    console.log('- Confirme se o endpoint sandbox está correto para o seu tenant');
    throw new Error(result.message || result.error || 'AppMax payment failed');
  }

  console.log('\n✅ PAGAMENTO APROVADO!');
  console.log('═══════════════════════════════════════');
  console.log('Transaction ID:', result.id || result.transaction_id);
  console.log('Status:', result.status);
  console.log('Valor:', `R$ ${result.amount || '10.00'}`);
  console.log('═══════════════════════════════════════\n');

  return result;
}

async function generateTokens() {
  const RAW_PAN = process.env.RAW_PAN;
  const EXP_MONTH = process.env.EV_EXP_MONTH;
  const EXP_YEAR = process.env.EV_EXP_YEAR;
  const RAW_CVC = process.env.RAW_CVC;

  if (!RAW_PAN || !EXP_MONTH || !EXP_YEAR) {
    throw new Error('Faltam variáveis de ambiente');
  }

  const mod = await import('@evervault/sdk');
  const SDK = mod.default || mod;
  const ev = new SDK(APP_ID, API_KEY);

  const twoDigitYear = String(EXP_YEAR).slice(-2);
  const expirationDateMMYY = `${String(EXP_MONTH).padStart(2, '0')}${twoDigitYear}`;

  const cardData = {
    number: RAW_PAN,
    expirationDate: expirationDateMMYY,
    cvc: RAW_CVC || '123',
  };

  const encrypted = await ev.encrypt(cardData);
  global.ENCRYPTED_CARD = encrypted;

  console.log('[ok] Tokens criptografados gerados');
}

(async () => {
  try {
    await generateTokens();
    await testAppMaxPayment();
  } catch (e) {
    console.error('[error]', e.message);
    process.exit(1);
  }
})();
