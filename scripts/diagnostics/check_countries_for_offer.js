#!/usr/bin/env node
/**
 * Diagnostics: Check configured countries for an offer/product in DB
 *
 * Usage:
 *   node scripts/diagnostics/check_countries_for_offer.js --offer <offerId>
 *   node scripts/diagnostics/check_countries_for_offer.js --product <productId>
 *   node scripts/diagnostics/check_countries_for_offer.js --offer <offerId> --expect BR,MX,US
 *
 * Behavior:
 * - Lists countries present in PaymentRoutingRule (active) and OfferPrice (active)
 * - Prints union list and per-country details (providers/prices/methods)
 * - If --expect is provided, exits non-zero when any expected country is missing
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { offer: '', product: '', expect: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--offer') out.offer = args[++i] || '';
    else if (a === '--product') out.product = args[++i] || '';
    else if (a === '--expect') out.expect = String(args[++i] || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  }
  if (!out.offer && !out.product) {
    throw new Error('Usage: --offer <offerId> or --product <productId>');
  }
  return out;
}

async function getRoutingCountries({ offer, product }) {
  const rows = await prisma.paymentRoutingRule.findMany({
    where: {
      ...(offer ? { offerId: offer } : {}),
      ...(product ? { productId: product } : {}),
      isActive: true,
    },
    select: { country: true },
  });
  return Array.from(new Set(rows.map(r => String(r.country || '').toUpperCase()).filter(Boolean)));
}

async function getPriceCountries({ offer }) {
  const rows = await prisma.offerPrice.findMany({
    where: {
      ...(offer ? { offerId: offer } : {}),
      active: true,
    },
    select: { country: true },
  });
  return Array.from(new Set(rows.map(r => String(r.country || '').toUpperCase()).filter(Boolean)));
}

async function getPerCountryDetails({ offer, product }) {
  const [rules, prices] = await Promise.all([
    prisma.paymentRoutingRule.findMany({
      where: {
        ...(offer ? { offerId: offer } : {}),
        ...(product ? { productId: product } : {}),
        isActive: true,
      },
      select: { country: true, method: true, provider: true },
      orderBy: [{ country: 'asc' }],
    }),
    prisma.offerPrice.findMany({
      where: {
        ...(offer ? { offerId: offer } : {}),
        active: true,
      },
      select: { country: true, currency: true, provider: true, amountCents: true, externalPriceId: true },
      orderBy: [{ country: 'asc' }],
    })
  ]);

  const byCountry = {};
  for (const r of rules) {
    const cc = String(r.country).toUpperCase();
    byCountry[cc] = byCountry[cc] || { routing: {}, prices: {} };
    byCountry[cc].routing[r.method] = r.provider;
  }
  for (const p of prices) {
    const cc = String(p.country).toUpperCase();
    byCountry[cc] = byCountry[cc] || { routing: {}, prices: {} };
    const prov = String(p.provider).toUpperCase();
    const cur = String(p.currency).toUpperCase();
    byCountry[cc].prices[prov] = byCountry[cc].prices[prov] || {};
    byCountry[cc].prices[prov][cur] = {
      amountCents: typeof p.amountCents === 'number' ? p.amountCents : null,
      externalPriceId: p.externalPriceId || null,
    };
  }
  return byCountry;
}

function printReport({ offer, product, routingCountries, priceCountries, unionCountries, details }) {
  console.log('=== Country Diagnostics ===');
  if (offer) console.log('Offer:', offer);
  if (product) console.log('Product:', product);
  console.log('Routing countries:', routingCountries.join(', ') || '(none)');
  console.log('Price countries  :', priceCountries.join(', ') || '(none)');
  console.log('Union countries  :', unionCountries.join(', ') || '(none)');
  console.log('');
  for (const cc of unionCountries) {
    const d = details[cc] || { routing: {}, prices: {} };
    console.log(`- ${cc}`);
    console.log('  routing:', JSON.stringify(d.routing));
    console.log('  prices :', JSON.stringify(d.prices));
  }
}

async function main() {
  const args = parseArgs();
  const routingCountries = await getRoutingCountries(args);
  const priceCountries = await getPriceCountries(args);
  const unionCountries = Array.from(new Set([...routingCountries, ...priceCountries]));
  const details = await getPerCountryDetails(args);
  printReport({ ...args, routingCountries, priceCountries, unionCountries, details });

  if (args.expect.length) {
    const missing = args.expect.filter(cc => !unionCountries.includes(cc));
    if (missing.length) {
      console.error('Missing expected countries:', missing.join(', '));
      process.exit(2);
    }
  }
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
