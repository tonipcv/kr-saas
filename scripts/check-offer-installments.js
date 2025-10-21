#!/usr/bin/env node
/*
  Check Offer Installments Policy

  Usage examples:
    node scripts/check-offer-installments.js --offer cmgv0bkki000vi68e8u6vlujr
    node scripts/check-offer-installments.js --url "http://localhost:3000/krx-clinic/checkout/gyaia5tdawq1ufidjoqk3q0k?offer=cmgv0bkki000vi68e8u6vlujr"

  What it does:
  - Loads Offer by ID via Prisma
  - Determines if it is Subscription (and the period in months)
  - Verifies if the subscription period (months) is allowed by maxInstallments and platform cap (12)
  - For one-time offers, prints whether price >= R$97 (9700 cents) to allow installments
*/

const dotenv = require('dotenv');
try { dotenv.config(); } catch {}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function parseArgs(argv) {
  const out = { offer: null, url: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--offer' && argv[i+1]) { out.offer = argv[++i]; continue; }
    if (a === '--url' && argv[i+1]) { out.url = argv[++i]; continue; }
  }
  return out;
}

function extractOfferIdFromUrl(u) {
  try {
    const url = new URL(u);
    const offer = url.searchParams.get('offer');
    return offer || null;
  } catch {
    return null;
  }
}

function monthsFromInterval(unit, count) {
  const c = Number(count || 1);
  const u = String(unit || 'MONTH').toUpperCase();
  if (u === 'YEAR') return c * 12;
  if (u === 'MONTH') return c;
  if (u === 'WEEK') return Math.max(1, Math.ceil(c / 4));
  if (u === 'DAY') return Math.max(1, Math.ceil(c / 30));
  return 1;
}

(async () => {
  const args = parseArgs(process.argv);
  let offerId = args.offer;
  if (!offerId && args.url) offerId = extractOfferIdFromUrl(args.url);

  if (!offerId) {
    console.error('Usage: --offer <offerId> or --url <checkoutUrlWithOfferParam>');
    process.exit(2);
  }

  try {
    const offer = await prisma.offer.findUnique({ where: { id: String(offerId) } });
    if (!offer) {
      console.error('Offer not found:', offerId);
      process.exit(1);
    }

    const report = [];
    const priceCents = Number(offer.priceCents || 0);
    const isSubscription = !!offer.isSubscription;
    const maxInstallments = offer.maxInstallments != null ? Number(offer.maxInstallments) : null;
    const intervalUnit = offer.intervalUnit || null;
    const intervalCount = offer.intervalCount != null ? Number(offer.intervalCount) : null;
    const months = isSubscription ? monthsFromInterval(intervalUnit, intervalCount) : 0;

    report.push(`Offer: ${offer.id}`);
    report.push(`- isSubscription: ${isSubscription}`);
    report.push(`- priceCents: ${priceCents}`);
    report.push(`- maxInstallments: ${maxInstallments}`);
    if (isSubscription) {
      report.push(`- interval: ${intervalCount} ${intervalUnit}`);
      report.push(`- months (derived): ${months}`);
      const platformCap = 12;
      const needed = Math.max(1, Math.min(months, platformCap));
      const pass = maxInstallments == null ? true : (Number(maxInstallments) >= needed);
      report.push(`- required installments >= ${needed}: ${pass ? 'OK' : 'FAIL'}`);
      if (!pass) {
        report.push(`  Suggestion: set Offer.maxInstallments to at least ${needed}`);
      }
    } else {
      const canSplit = priceCents >= 9700;
      report.push(`- one-time canSplitByPrice(>=97 BRL): ${canSplit ? 'YES' : 'NO'}`);
    }

    console.log(report.join('\n'));
    await prisma.$disconnect();
    process.exit(0);
  } catch (e) {
    console.error('Error:', e && e.message ? e.message : e);
    try { await prisma.$disconnect(); } catch {}
    process.exit(1);
  }
})();
