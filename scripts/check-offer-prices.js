#!/usr/bin/env node
/*
Usage:
  OFFER_ID=<offerId> node scripts/check-offer-prices.js [--countries BR,US,PT,MX] [--currencies BRL,USD,EUR,MXN]
*/
const { PrismaClient } = require('@prisma/client');

function parseList(arg, fallback) {
  if (!arg || typeof arg !== 'string') return fallback;
  return arg.split(',').map(s => String(s || '').trim().toUpperCase()).filter(Boolean);
}

(async function main() {
  const prisma = new PrismaClient();
  try {
    const argv = process.argv.slice(2);
    const getArgVal = (k) => {
      const idx = argv.findIndex(x => x === k || x.startsWith(k + '='));
      if (idx === -1) return undefined;
      const tk = argv[idx];
      if (tk.includes('=')) return tk.split('=').slice(1).join('=');
      return argv[idx + 1];
    };

    const offerId = process.env.OFFER_ID || getArgVal('--offer') || getArgVal('-o');
    if (!offerId) {
      console.error('[check-offer-prices] Please provide OFFER_ID env or --offer <id>');
      process.exit(2);
    }
    const countries = parseList(getArgVal('--countries'), ['BR','US','PT','MX']);
    const currencies = parseList(getArgVal('--currencies'), ['BRL','USD','EUR','MXN']);

    console.log(`[check] offerId=${offerId}`);
    const rows = await prisma.$queryRawUnsafe(
      `SELECT offer_id, country, currency, provider, amount_cents, external_price_id, active, updated_at
         FROM offer_prices
        WHERE offer_id = $1
        ORDER BY country, currency, provider, updated_at DESC`,
      offerId
    );

    const byKey = new Map();
    for (const r of rows) {
      const key = `${String(r.country).toUpperCase()}-${String(r.currency).toUpperCase()}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(r);
    }

    for (const cc of countries) {
      for (const cur of currencies) {
        const key = `${cc}-${cur}`;
        const list = byKey.get(key) || [];
        const providers = list.map(r => {
          const p = String(r.provider).toUpperCase();
          const inactive = r.active === false ? '(inactive)' : '';
          const amt = Number(r.amount_cents || 0);
          const ext = r.external_price_id ? `#${r.external_price_id}` : '';
          return `${p}${inactive}:${amt}${ext}`;
        });
        console.log(`${key}: ${providers.length ? providers.join(', ') : '(none)'}`);
      }
    }

    // Helpful summary for BR/BRL
    const br = (byKey.get('BR-BRL') || []).map(r => ({
      provider: String(r.provider).toUpperCase(),
      active: r.active !== false,
      amountCents: Number(r.amount_cents || 0),
      externalPriceId: r.external_price_id || null,
    }));
    console.log('\n[summary BR/BRL]', br);
  } catch (e) {
    console.error('[check-offer-prices] error', e);
    process.exit(1);
  } finally {
    try { await prisma.$disconnect(); } catch {}
  }
})();
