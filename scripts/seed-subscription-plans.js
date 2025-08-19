#!/usr/bin/env node

/*
  Seeds/Upserts subscription plans: FREE, STARTER, CREATOR, ENTERPRISE
  Usage:
    node scripts/seed-subscription-plans.js
*/

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function upsertPlan({ key, name, description, price, billingCycle = 'MONTHLY', maxDoctors, maxPatients, maxProtocols, maxCourses, maxProducts, isDefault = false, trialDays = 7, features }) {
  const featuresStr = JSON.stringify(features || {});

  const existing = await prisma.subscriptionPlan.findFirst({ where: { name } });
  if (existing) {
    const updated = await prisma.subscriptionPlan.update({
      where: { id: existing.id },
      data: {
        description,
        price,
        billingCycle,
        maxDoctors,
        maxPatients,
        maxProtocols,
        maxCourses,
        maxProducts,
        isActive: true,
        isDefault,
        trialDays,
        features: featuresStr,
      },
      select: { id: true, name: true, price: true, isDefault: true }
    });
    console.log(`Updated plan: ${name}`, updated);
    return updated;
  }

  const created = await prisma.subscriptionPlan.create({
    data: {
      name,
      description,
      price,
      billingCycle,
      maxDoctors,
      maxPatients,
      maxProtocols,
      maxCourses,
      maxProducts,
      isActive: true,
      isDefault,
      trialDays,
      features: featuresStr,
    },
    select: { id: true, name: true, price: true, isDefault: true }
  });
  console.log(`Created plan: ${name}`, created);
  return created;
}

async function main() {
  // FREE
  await upsertPlan({
    key: 'FREE',
    name: 'Free',
    description: 'Plano gratuito com limites básicos',
    price: 0,
    maxDoctors: 1,
    maxPatients: 10,
    maxProtocols: 10,
    maxCourses: 3,
    maxProducts: 20,
    isDefault: true,
    trialDays: 7,
    features: {
      maxReferralsPerMonth: 100,
      allowPurchaseCredits: false,
      maxRewards: 10,
      allowCampaigns: false,
      price: 0,
    },
  });

  // STARTER
  await upsertPlan({
    key: 'STARTER',
    name: 'Starter',
    description: 'Plano Starter',
    price: 40,
    maxDoctors: 3,
    maxPatients: 100,
    maxProtocols: 50,
    maxCourses: 20,
    maxProducts: 200,
    isDefault: false,
    trialDays: 7,
    features: {
      maxReferralsPerMonth: 500,
      allowPurchaseCredits: true,
      maxRewards: 50,
      allowCampaigns: false,
      price: 40,
    },
  });

  // CREATOR
  await upsertPlan({
    key: 'CREATOR',
    name: 'Creator',
    description: 'Plano Creator',
    price: 197,
    maxDoctors: 5,
    maxPatients: 1000,
    maxProtocols: 200,
    maxCourses: 100,
    maxProducts: 1000,
    isDefault: false,
    trialDays: 7,
    features: {
      maxReferralsPerMonth: 2000,
      allowPurchaseCredits: true,
      maxRewards: 50,
      allowCampaigns: false,
      price: 197,
    },
  });

  // ENTERPRISE
  await upsertPlan({
    key: 'ENTERPRISE',
    name: 'Enterprise',
    description: 'Plano Enterprise com limites customizados',
    price: 0, // negociado
    maxDoctors: 9999,
    maxPatients: 100000,
    maxProtocols: 100000,
    maxCourses: 100000,
    maxProducts: 100000,
    isDefault: false,
    trialDays: 7,
    features: {
      maxReferralsPerMonth: 100000,
      allowPurchaseCredits: true,
      maxRewards: 100000,
      allowCampaigns: true,
      price: null,
    },
  });
}

main()
  .catch((e) => {
    console.error('Error seeding subscription plans:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
