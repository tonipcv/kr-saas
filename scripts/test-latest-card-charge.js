#!/usr/bin/env node
/**
 * Test the latest PAID credit-card charge against Pagar.me API.
 *
 * Usage:
 *   node scripts/test-latest-card-charge.js                     # Only GET the latest paid card charge
 *   node scripts/test-latest-card-charge.js --refund            # Attempt cancel/refund DELETE /charges/{id}
 *   node scripts/test-latest-card-charge.js --refund --amount 500 # Refund 500 cents via POST /charges/{id}/refunds if DELETE fails
 *
 * Env used (same as app):
 *   PAGARME_API_KEY (required)
 *   PAGARME_BASE_URL (defaults to https://api.pagar.me/core/v5)
 *   PAGARME_AUTH_SCHEME (default 'basic' | 'bearer')
 *   PAGARME_ACCOUNT_ID (optional, sets X-PagarMe-Account-Id)
 *   DATABASE_URL (Prisma)
 */

const { PrismaClient } = require('@prisma/client');

function getArg(flag, fallback = undefined) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  if (!v || v.startsWith('--')) return true;
  return v;
}

const API_KEY = process.env.PAGARME_API_KEY || '';
const BASE_URL = process.env.PAGARME_BASE_URL || 'https://api.pagar.me/core/v5';
const AUTH_SCHEME = (process.env.PAGARME_AUTH_SCHEME || 'basic').toLowerCase();
const ACCOUNT_ID = process.env.PAGARME_ACCOUNT_ID || '';

function authHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (AUTH_SCHEME === 'bearer') {
    h.Authorization = `Bearer ${API_KEY}`;
  } else {
    const token = Buffer.from(`${API_KEY}:`).toString('base64');
    h.Authorization = `Basic ${token}`;
  }
  if (ACCOUNT_ID) h['X-PagarMe-Account-Id'] = ACCOUNT_ID;
  return h;
}

async function getCharge(chargeId) {
  const url = `${BASE_URL}/charges/${encodeURIComponent(chargeId)}`;
  const res = await fetch(url, { method: 'GET', headers: authHeaders(), cache: 'no-store' });
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, data, text };
}

async function cancelCharge(chargeId) {
  const url = `${BASE_URL}/charges/${encodeURIComponent(chargeId)}`;
  const res = await fetch(url, { method: 'DELETE', headers: authHeaders(), cache: 'no-store' });
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, data, text };
}

async function refundCharge(chargeId, amountCents) {
  const url = `${BASE_URL}/charges/${encodeURIComponent(chargeId)}/refunds`;
  const body = {};
  if (Number.isFinite(Number(amountCents)) && Number(amountCents) > 0) body.amount = Math.floor(Number(amountCents));
  const res = await fetch(url, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body), cache: 'no-store' });
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, data, text };
}

async function main() {
  if (!API_KEY) {
    console.error('[test] PAGARME_API_KEY is not set');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const row = await prisma.paymentTransaction.findFirst({
      where: {
        provider: 'pagarme',
        status: { in: ['paid', 'PAID'] },
        paymentMethodType: { in: ['credit_card', 'card', 'CARD'] },
        providerChargeId: { not: null },
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        providerOrderId: true,
        providerChargeId: true,
        amountCents: true,
        currency: true,
        updatedAt: true,
      },
    });
    if (!row) {
      console.log('[test] No PAID card transaction found.');
      return;
    }
    console.log('[test] Latest PAID card tx:', row);

    const { providerChargeId: chargeId } = row;
    const get = await getCharge(chargeId);
    console.log('[test] GET charge status:', get.status);
    if (!get.ok) {
      console.log('[test] GET error payload:', get.data || get.text);
      console.log('[test] Hints: verify PAGARME_BASE_URL, PAGARME_API_KEY, X-PagarMe-Account-Id match the account where this charge was created.');
      return;
    }
    console.log('[test] Charge summary:', {
      id: get.data?.id,
      status: get.data?.status,
      amount: get.data?.amount,
      paid_amount: get.data?.paid_amount,
      payment_method: get.data?.payment_method,
      order_id: get.data?.order?.id,
      created_at: get.data?.created_at,
      paid_at: get.data?.paid_at,
    });

    const doRefund = !!getArg('--refund', false);
    const partial = getArg('--amount', undefined);
    if (!doRefund) {
      console.log('[test] Skipping refund. Use --refund to attempt cancel/refund, optional --amount <cents> for partial.');
      return;
    }

    console.log('[test] Attempting DELETE cancel...');
    const del = await cancelCharge(chargeId);
    console.log('[test] DELETE result:', del.status, del.data || del.text);

    if (!del.ok) {
      console.log('[test] Falling back to POST refunds...');
      const r = await refundCharge(chargeId, partial);
      console.log('[test] POST refunds result:', r.status, r.data || r.text);
    }
  } catch (e) {
    console.error('[test] Error:', e?.message || e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
