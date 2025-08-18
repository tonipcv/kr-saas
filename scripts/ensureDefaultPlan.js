#!/usr/bin/env node

/*
  Ensures there is a default SubscriptionPlan in the database.
  Usage:
    node scripts/ensureDefaultPlan.js
*/

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const existingDefault = await prisma.subscriptionPlan.findFirst({ where: { isDefault: true } });

  if (existingDefault) {
    console.log('Default plan already exists:', {
      id: existingDefault.id,
      name: existingDefault.name,
      price: existingDefault.price,
      trialDays: existingDefault.trialDays,
    });
    return;
  }

  console.log('No default plan found. Creating a new default plan...');
  const plan = await prisma.subscriptionPlan.create({
    data: {
      name: 'Básico',
      description: 'Plano padrão para novos médicos',
      price: 0,
      billingCycle: 'MONTHLY',
      maxDoctors: 1,
      features: 'Criado automaticamente pelo ensureDefaultPlan',
      isActive: true,
      maxPatients: 50,
      maxProtocols: 10,
      maxCourses: 5,
      maxProducts: 100,
      isDefault: true,
      trialDays: 14,
    },
    select: {
      id: true,
      name: true,
      price: true,
      isDefault: true,
      trialDays: true,
    },
  });

  console.log('Default plan created:', plan);
}

main()
  .catch((e) => {
    console.error('Error ensuring default plan:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
