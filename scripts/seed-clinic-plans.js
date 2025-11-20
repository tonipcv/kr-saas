/*
 Seed default Clinic Plans via Node.js (Option A tiers)
 Usage: NODE_ENV=development node scripts/seed-clinic-plans.js
 Requires: @prisma/client configured to point to your database.
*/

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const plans = [
  {
    name: 'Free',
    description: 'Up to 100 transactions/month',
    monthlyPrice: 0,
    monthlyTxLimit: 100,
    features: { transactionsLimit: 100 },
    tier: 'STARTER',
    isActive: true,
  },
  {
    name: 'Pro',
    description: 'Up to 1,000 transactions/month',
    monthlyPrice: 99,
    monthlyTxLimit: 1000,
    features: { transactionsLimit: 1000 },
    tier: 'GROWTH',
    isActive: true,
  },
  {
    name: 'Scale',
    description: 'Up to 10,000 transactions/month',
    monthlyPrice: 297,
    monthlyTxLimit: 10000,
    features: { transactionsLimit: 10000 },
    tier: 'ENTERPRISE',
    isActive: true,
  },
];

async function upsertClinicPlan(p) {
  const existing = await prisma.clinicPlan.findFirst({ where: { name: p.name } });
  if (existing) {
    const updated = await prisma.clinicPlan.update({
      where: { id: existing.id },
      data: {
        description: p.description,
        monthlyPrice: p.monthlyPrice,
        monthlyTxLimit: p.monthlyTxLimit,
        features: p.features,
        tier: p.tier,
        isActive: true,
      },
    });
    return { action: 'updated', id: updated.id, name: updated.name };
  }
  const created = await prisma.clinicPlan.create({
    data: {
      name: p.name,
      description: p.description,
      monthlyPrice: p.monthlyPrice,
      monthlyTxLimit: p.monthlyTxLimit,
      features: p.features,
      tier: p.tier,
      isActive: true,
    },
  });
  return { action: 'created', id: created.id, name: created.name };
}

async function main() {
  const results = [];
  for (const p of plans) {
    try {
      const res = await upsertClinicPlan(p);
      results.push(res);
      console.log(`[seed] ${res.action} plan: ${res.name} (${res.id})`);
    } catch (e) {
      console.error('[seed] failed for plan', p.name, e);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
