// test-pagarme-relay.js
// Pagar.me via Evervault Relay smoke test

const APP_ID = process.env.VAULT_APP_ID;
const API_KEY = process.env.EVERVAULT_API_KEY;
const PAGARME_KEY = process.env.PAGARME_API_KEY; // sua chave de teste da Pagar.me

// URL do Relay (copie do dashboard depois de criar)
const PAGARME_RELAY = 'https://api-pagar-me-app-05f835b19807.relay.evervault.app';

async function testPagarmePayment() {
  if (!global.ENCRYPTED_CARD) throw new Error('Encrypted card not generated');
  if (!PAGARME_KEY) throw new Error('Missing PAGARME_API_KEY in env');
  if (!APP_ID || !API_KEY) throw new Error('Missing VAULT_APP_ID / EVERVAULT_API_KEY');

  const cardTokens = {
    number: global.ENCRYPTED_CARD.number,
    expirationDate: global.ENCRYPTED_CARD.expirationDate,
    cvc: global.ENCRYPTED_CARD.cvc,
  };

  console.log('[test] Processando pagamento de R$ 10,00 via Pagar.me Relay...');
  console.log('[debug] Tokens criptografados sendo enviados...');
  console.log('  card_number:', (cardTokens.number || '').substring(0, 30) + '...');
  console.log('  card_cvv:', (cardTokens.cvc || '').substring(0, 30) + '...');
  console.log('  card_expiration_date token:', cardTokens.expirationDate);

  const payload = {
    api_key: PAGARME_KEY,
    amount: 1000, // R$ 10,00 em centavos
    payment_method: 'credit_card',
    card_number: cardTokens.number,              // Token criptografado
    card_cvv: cardTokens.cvc,                    // Token criptografado
    card_expiration_date: cardTokens.expirationDate, // MMYY tokenizado como único campo
    card_holder_name: 'TESTE EVERVAULT',
    customer: {
      external_id: 'test-customer-123',
      name: 'Cliente Teste',
      type: 'individual',
      country: 'br',
      email: 'teste@example.com',
      documents: [
        {
          type: 'cpf',
          number: '11111111111' // CPF de teste
        }
      ],
      phone_numbers: ['+5511999999999']
    },
    billing: {
      name: 'Cliente Teste',
      address: {
        country: 'br',
        state: 'sp',
        city: 'São Paulo',
        neighborhood: 'Centro',
        street: 'Rua Teste',
        street_number: '123',
        zipcode: '01310100'
      }
    }
  };

  console.log('[debug] Payload Pagar.me (JSON):');
  console.log(JSON.stringify({
    ...payload,
    card_number: (payload.card_number || '').substring(0, 30) + '...',
    card_cvv: (payload.card_cvv || '').substring(0, 30) + '...',
    card_expiration_date: payload.card_expiration_date,
  }, null, 2));

  const response = await fetch(`${PAGARME_RELAY}/1/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Evervault-App-Id': APP_ID,
      'X-Evervault-Api-Key': API_KEY,
    },
    body: JSON.stringify(payload)
  });

  const result = await response.json();

  if (!response.ok || result.errors) {
    console.error('[error] Pagar.me retornou erro:', JSON.stringify(result, null, 2));
    throw new Error(result.errors?.[0]?.message || result?.message || 'Pagar.me payment failed');
  }

  console.log('\n✅ PAGAMENTO APROVADO!');
  console.log('═══════════════════════════════════════');
  console.log('Transaction ID:', result.id);
  console.log('Status:', result.status);
  console.log('Valor:', `R$ ${(result.amount / 100).toFixed(2)}`);
  console.log('TID:', result.tid);
  console.log('NSU:', result.nsu);
  console.log('Cartão (últimos 4):', result.card?.last_digits || 'N/A');
  console.log('Bandeira:', result.card?.brand || 'N/A');
  console.log('═══════════════════════════════════════\n');

  return result;
}

async function generateTokens() {
  const RAW_PAN = process.env.RAW_PAN;
  const EXP_MONTH = process.env.EV_EXP_MONTH;
  const EXP_YEAR = process.env.EV_EXP_YEAR;
  const RAW_CVC = process.env.RAW_CVC;

  if (!RAW_PAN || !EXP_MONTH || !EXP_YEAR) {
    throw new Error('Faltam variáveis de ambiente RAW_PAN / EV_EXP_MONTH / EV_EXP_YEAR');
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
    await testPagarmePayment();
  } catch (e) {
    console.error('[error]', e.message);
    process.exit(1);
  }
})();
