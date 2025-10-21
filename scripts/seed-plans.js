#!/usr/bin/env node
/*
  scripts/seed-plans.js
  Verify and (optionally) seed ClinicPlan rows.

  Usage:
    node scripts/seed-plans.js --preview   # default; read-only
    node scripts/seed-plans.js --apply     # writes default plans if none exist
*/
const { PrismaClient, Prisma } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

const DEFAULT_PLANS = [
  {
    name: 'Starter',
    tier: 'STARTER',
    description: 'Plano inicial para começar a vender.',
    monthlyPrice: new Prisma.Decimal(99),
    baseDoctors: 1,
    basePatients: 500,
    features: {
      maxReferralsPerMonth: 500,
      maxProducts: 50,
      customBranding: false,
      advancedReports: false,
    },
  },
  {
    name: 'Growth',
    tier: 'GROWTH',
    description: 'Cresça sua clínica com mais limites.',
    monthlyPrice: new Prisma.Decimal(249),
    baseDoctors: 3,
    basePatients: 2000,
    features: {
      maxReferralsPerMonth: 2000,
      maxProducts: 200,
      customBranding: true,
      advancedReports: true,
    },
  },
  {
    name: 'Enterprise',
    tier: 'ENTERPRISE',
    description: 'Plano corporativo sob medida. Fale com vendas.',
    monthlyPrice: null, // contact-only
    baseDoctors: -1,
    basePatients: -1,
    features: {
      maxReferralsPerMonth: -1,
      maxProducts: -1,
      customBranding: true,
      advancedReports: true,
    },
  },
];

async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has('--apply');

  console.log('Checking existing ClinicPlan entries...');
  const existing = await prisma.clinicPlan.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, tier: true, monthlyPrice: true, isActive: true },
  }).catch((e) => {
    console.error('Failed to read ClinicPlan. Make sure the table exists.', e?.message || e);
    return [];
  });

  if (existing.length > 0) {
    console.log(`Found ${existing.length} plan(s):`);
    for (const p of existing) {
      console.log(`- ${p.name} [${p.tier}] price=${p.monthlyPrice ?? 'null'} active=${p.isActive}`);
    }
    if (!apply) {
      console.log('\nPreview mode: no changes made.');
      await prisma.$disconnect();
      return;
    }
    console.log('\n--apply was specified, will ensure defaults exist (upsert by name/tier).');
  } else {
    console.log('No plans found.');
    if (!apply) {
      console.log('\nPreview of plans to create:');
      for (const d of DEFAULT_PLANS) {
        console.log(`- ${d.name} [${d.tier}] price=${d.monthlyPrice ?? 'null'}`);
      }
      console.log('\nRun with --apply to create them.');
      await prisma.$disconnect();
      return;
    }
  }

  if (apply) {
    for (const d of DEFAULT_PLANS) {
      await prisma.clinicPlan.upsert({
        where: { // using name+tier unique combination via manual lookup
          id: (
            await (async () => {
              const found = await prisma.clinicPlan.findFirst({ where: { name: d.name, tier: d.tier } });
              return found?.id || '___force_create___';
            })()
          )
        },
        update: {
          description: d.description,
          monthlyPrice: d.monthlyPrice,
          baseDoctors: d.baseDoctors,
          basePatients: d.basePatients,
          features: d.features,
          isActive: true,
          isPublic: true,
        },
        create: {
          name: d.name,
          tier: d.tier,
          description: d.description,
          monthlyPrice: d.monthlyPrice,
          baseDoctors: d.baseDoctors,
          basePatients: d.basePatients,
          features: d.features,
          trialDays: 14,
          requireCard: false,
          isActive: true,
          isPublic: true,
        },
      }).catch(async (e) => {
        if (String(e?.message || '').includes('Record to update not found')) {
          // create path if upsert failed due to fake id
          await prisma.clinicPlan.create({
            data: {
              name: d.name,
              tier: d.tier,
              description: d.description,
              monthlyPrice: d.monthlyPrice,
              baseDoctors: d.baseDoctors,
              basePatients: d.basePatients,
              features: d.features,
              trialDays: 14,
              requireCard: false,
              isActive: true,
              isPublic: true,
            },
          });
        } else {
          throw e;
        }
      });
      console.log(`Ensured plan: ${d.name} [${d.tier}]`);
    }
    console.log('Done.');
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
