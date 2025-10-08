#!/usr/bin/env node
/*
  Testa comportamento de split no Pagar.me v5 (Core) de forma isolada do app.

  Requisitos de ambiente:
    - PAGARME_API_KEY
    - PAGARME_BASE_URL (ex.: https://api.pagar.me/core/v5)
    - PAGARME_AUTH_SCHEME (basic|bearer) [opcional, default basic]
    - PAGARME_ACCOUNT_ID [opcional]

  Requisitos do banco (para resolver recebedor da clínica):
    - Utiliza prisma compilado: dist/lib/prisma.js
    - CLINIC_SLUG (default: bella-vida)

  Execução:
    CLINIC_SLUG=bella-vida AMOUNT_CENTS=10000 node scripts/debug/test_pagarme_split.js
*/

const path = require('path');
const fs = require('fs');

let prisma;
async function ensurePrisma() {
  try {
    prisma = require('../../dist/lib/prisma.js').prisma;
  } catch (e) {
    console.error('[split-test] Aviso: não foi possível carregar prisma de dist/lib/prisma.js. Se você fornecer RECIPIENT_ID por env, o teste seguirá sem prisma.');
    prisma = null;
  }
}

async function ensureFetch() {
  if (typeof fetch !== 'function') {
    const mod = await import('node-fetch');
    // eslint-disable-next-line no-global-assign
    fetch = mod.default;
  }
}

function authHeaders() {
  const apiKey = process.env.PAGARME_API_KEY || '';
  const scheme = (process.env.PAGARME_AUTH_SCHEME || 'basic').toLowerCase();
  const accountId = process.env.PAGARME_ACCOUNT_ID || '';
  if (!apiKey) throw new Error('PAGARME_API_KEY ausente');
  const h = { 'Content-Type': 'application/json' };
  if (scheme === 'bearer') h['Authorization'] = `Bearer ${apiKey}`;
  else h['Authorization'] = `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`;
  if (accountId) h['X-PagarMe-Account-Id'] = accountId;
  return h;
}

async function pagarmeCreateOrder(payload) {
  const base = process.env.PAGARME_BASE_URL || '';
  if (!base) throw new Error('PAGARME_BASE_URL ausente');
  const url = `${base.replace(/\/$/, '')}/orders`;
  const res = await fetch(url, { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) });
  const text = await res.text();
  let data = {};
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) {
    const msg = Array.isArray(data?.errors) ? data.errors.map(e => e?.message || e?.code || JSON.stringify(e)).join(' | ') : (data?.message || data?.error || text);
    const err = new Error(`[Pagarme ${res.status}] ${msg}`);
    err.status = res.status; err.responseJson = data; err.responseText = text;
    throw err;
  }
  return data;
}

function buildTestPayload({ amountCents, splitRules }) {
  const amt = Number(amountCents || 1000);
  const customer = {
    name: 'Split Test Buyer',
    email: `split.test+${Date.now()}@example.com`,
    document: '11111111111',
    type: 'individual',
    phones: { mobile_phone: { country_code: '55', area_code: '11', number: '999999999' } },
    address: { line_1: 'Av. Paulista, 1000', zip_code: '01310200', city: 'São Paulo', state: 'SP', country: 'BR' },
  };
  const items = [{ code: 'split_test', type: 'product', amount: amt, quantity: 1, description: 'Split Test' }];
  const payments = [{
    amount: amt,
    payment_method: 'credit_card',
    credit_card: {
      installments: 1,
      operation_type: 'auth_and_capture',
      card: {
        number: '4000000000000010', // cartão de teste
        holder_name: 'SPLIT TEST',
        exp_month: 12,
        exp_year: 2030,
        cvv: '123',
        billing_address: { line_1: 'Av. Paulista, 1000', zip_code: '01310200', city: 'São Paulo', state: 'SP', country: 'BR' },
      }
    },
  }];
  if (Array.isArray(splitRules) && splitRules.length) {
    payments[0].split = splitRules;
  }
  return { customer, items, payments };
}

async function main() {
  await ensurePrisma();
  await ensureFetch();
  const slug = process.env.CLINIC_SLUG || 'bella-vida';
  const amountCents = Number(process.env.AMOUNT_CENTS || 10000);
  const envRecipient = process.env.RECIPIENT_ID || '';

  let recipientId = envRecipient;
  let merchant = { recipientId: null, splitPercent: null, platformFeeBps: null };
  if (!recipientId) {
    if (!prisma) throw new Error('RECIPIENT_ID ausente e prisma indisponível. Forneça RECIPIENT_ID no env ou faça build para usar prisma.');
    const clinic = await prisma.clinic.findFirst({ where: { slug }, select: { id: true, name: true } });
    if (!clinic) throw new Error(`Clínica não encontrada pelo slug: ${slug}`);
    const m = await prisma.merchant.findUnique({ where: { clinicId: clinic.id } });
    if (!m?.recipientId) throw new Error('Merchant sem recipientId');
    recipientId = m.recipientId;
    merchant = { recipientId: m.recipientId, splitPercent: m.splitPercent, platformFeeBps: m.platformFeeBps };
    console.log('[split-test] Clinic:', clinic);
  } else {
    console.log('[split-test] Usando RECIPIENT_ID do env');
  }
  merchant.recipientId = recipientId;

  console.log('[split-test] Merchant:', { recipientId: merchant.recipientId, splitPercent: merchant.splitPercent, platformFeeBps: merchant.platformFeeBps });

  // Teste A: 100% para clínica (regra única flat)
  const split100 = [{
    recipient_id: String(merchant.recipientId),
    amount: amountCents,
    type: 'flat',
    options: { charge_processing_fee: false, liable: true, charge_remainder: false },
  }];
  const payloadA = buildTestPayload({ amountCents, splitRules: split100 });
  console.log('[split-test] Payload A (100%):', JSON.stringify(payloadA));
  try {
    const orderA = await pagarmeCreateOrder(payloadA);
    const ch = Array.isArray(orderA?.charges) ? orderA.charges[0] : null;
    const tx = ch?.last_transaction || null;
    console.log('[split-test] Result A:', {
      order_id: orderA?.id,
      charge_id: ch?.id,
      status: (tx?.status || ch?.status || orderA?.status || '').toString(),
      acquirer_message: tx?.acquirer_message || null,
      gateway_response_message: (tx || {}).gateway_response_message || null,
    });
  } catch (e) {
    console.error('[split-test] Error A (100%):', e?.message, e?.responseJson || e?.responseText);
  }

  // Teste B: parcial (80% clínica) — sem segunda regra para plataforma
  const partialPercent = typeof merchant.splitPercent === 'number' ? merchant.splitPercent : 80;
  const clinicAmount = Math.round(amountCents * Math.min(1, Math.max(0, partialPercent / 100)));
  const splitPartial = [{
    recipient_id: String(merchant.recipientId),
    amount: clinicAmount,
    type: 'flat',
    options: { charge_processing_fee: false, liable: true, charge_remainder: false },
  }];
  const payloadB = buildTestPayload({ amountCents, splitRules: splitPartial });
  console.log('[split-test] Payload B (partial):', JSON.stringify(payloadB));
  try {
    const orderB = await pagarmeCreateOrder(payloadB);
    const ch = Array.isArray(orderB?.charges) ? orderB.charges[0] : null;
    const tx = ch?.last_transaction || null;
    console.log('[split-test] Result B:', {
      order_id: orderB?.id,
      charge_id: ch?.id,
      status: (tx?.status || ch?.status || orderB?.status || '').toString(),
      acquirer_message: tx?.acquirer_message || null,
      gateway_response_message: (tx || {}).gateway_response_message || null,
    });
  } catch (e) {
    console.error('[split-test] Error B (partial):', e?.message, e?.responseJson || e?.responseText);
  }

  await prisma.$disconnect().catch(() => {});
  console.log('[split-test] Done.');
}

main().catch((e) => { console.error('[split-test] Fatal:', e); process.exit(1); });
