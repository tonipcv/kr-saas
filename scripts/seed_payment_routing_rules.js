// Seed PaymentRoutingRule entries for a given offer and country list
// Usage:
//   node scripts/seed_payment_routing_rules.js --offer <offerId> --rules rules.json
// rules.json example:
// {
//   "BR": { "CARD": "STRIPE", "PIX": "KRXPAY", "OPEN_FINANCE": "KRXPAY", "OPEN_FINANCE_AUTOMATIC": "KRXPAY" },
//   "MX": { "CARD": "STRIPE" },
//   "US": { "CARD": "STRIPE" }
// }

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { offer: '', rules: '' };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--offer') out.offer = args[++i] || '';
    else if (a === '--rules') out.rules = args[++i] || '';
  }
  if (!out.offer) throw new Error('Missing --offer <offerId>');
  if (!out.rules) throw new Error('Missing --rules <rules.json path>');
  return out;
}

async function upsertRule(offerId, country, method, provider) {
  // Low priority number wins; default 10
  const priority = 10;
  const isActive = true;
  // Use upsert via unique composite simulated by find+create/update
  const existing = await prisma.paymentRoutingRule.findFirst({ where: { offerId, country, method } });
  if (existing) {
    return prisma.paymentRoutingRule.update({ where: { id: existing.id }, data: { provider, priority, isActive } });
  }
  return prisma.paymentRoutingRule.create({ data: { offerId, country, method, provider, priority, isActive, merchantId: '' } });
}

async function main() {
  const { offer, rules } = parseArgs();
  const json = JSON.parse(fs.readFileSync(path.resolve(rules), 'utf8'));

  const METHODS = ['CARD','PIX','OPEN_FINANCE','OPEN_FINANCE_AUTOMATIC'];
  const results = [];
  for (const cc of Object.keys(json)) {
    const map = json[cc] || {};
    for (const m of METHODS) {
      const prov = map[m];
      if (!prov) continue; // skip if not provided
      if (!['STRIPE','KRXPAY'].includes(prov)) { console.warn(`Skip invalid provider ${prov} for ${cc}/${m}`); continue; }
      results.push(await upsertRule(offer, cc.toUpperCase(), m, prov));
    }
  }
  console.log(`Seeded rules: ${results.length}`);
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
