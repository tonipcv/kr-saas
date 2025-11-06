#!/usr/bin/env node
/**
 * Cross-check an order and its charges in Pagar.me v5 using the latest paid card tx (or explicit ids).
 *
 * Usage:
 *   node scripts/test-order-and-charge.js                    # Uses latest paid card tx
 *   node scripts/test-order-and-charge.js --order or_xxx     # Force a specific order id
 *   node scripts/test-order-and-charge.js --charge ch_xxx    # Force a specific charge id
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
  if (AUTH_SCHEME === 'bearer') h.Authorization = `Bearer ${API_KEY}`;
  else h.Authorization = `Basic ${Buffer.from(`${API_KEY}:`).toString('base64')}`;
  if (ACCOUNT_ID) h['X-PagarMe-Account-Id'] = ACCOUNT_ID;
  return h;
}

async function getOrder(orderId) {
  const res = await fetch(`${BASE_URL}/orders/${encodeURIComponent(orderId)}`, {
    method: 'GET', headers: authHeaders(), cache: 'no-store'
  });
  const text = await res.text(); let data = null; try { data = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, data, text };
}

async function getCharge(chargeId) {
  const res = await fetch(`${BASE_URL}/charges/${encodeURIComponent(chargeId)}`, {
    method: 'GET', headers: authHeaders(), cache: 'no-store'
  });
  const text = await res.text(); let data = null; try { data = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, data, text };
}

async function main() {
  if (!API_KEY) {
    console.error('[test] PAGARME_API_KEY not set');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    let orderId = getArg('--order');
    let chargeId = getArg('--charge');

    if (!orderId || !chargeId) {
      const row = await prisma.paymentTransaction.findFirst({
        where: {
          provider: 'pagarme',
          status: { in: ['paid', 'PAID'] },
          paymentMethodType: { in: ['credit_card', 'card', 'CARD'] },
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        select: { providerOrderId: true, providerChargeId: true, id: true, updatedAt: true },
      });
      if (!row) {
        console.log('[test] No paid card transaction found.');
        return;
      }
      orderId = orderId || row.providerOrderId;
      chargeId = chargeId || row.providerChargeId;
      console.log('[test] Using tx:', row);
    }

    console.log('[test] Fetching ORDER', orderId);
    const o = await getOrder(orderId);
    console.log('[test] ORDER status:', o.status);
    if (!o.ok) {
      console.log('[test] ORDER error:', o.data || o.text);
      console.log('[test] Hints: API key/account/baseURL mismatch with where the order was created.');
      return;
    }

    const orderCharges = Array.isArray(o.data?.charges) ? o.data.charges.map((c) => c.id) : [];
    console.log('[test] ORDER has charges:', orderCharges);

    if (chargeId) {
      console.log('[test] Fetching CHARGE', chargeId);
      const c = await getCharge(chargeId);
      console.log('[test] CHARGE status:', c.status);
      if (!c.ok) {
        console.log('[test] CHARGE error:', c.data || c.text);
        // If the charge is in the order but charge GET 404, it suggests header account mismatch required on charge routes
        if (orderCharges.includes(chargeId)) {
          console.log('[test] Note: order lists this charge, but GET /charges/{id} 404 – check X-PagarMe-Account-Id');
        }
      } else {
        console.log('[test] CHARGE summary:', { id: c.data?.id, status: c.data?.status, order_id: c.data?.order?.id });
      }
    }
  } catch (e) {
    console.error('[test] Error:', e?.message || e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
