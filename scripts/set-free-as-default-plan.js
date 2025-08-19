// Ensure the 'Free' plan exists and is the sole default plan
// Usage: node scripts/set-free-as-default-plan.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Find or create Free plan
  let free = await prisma.subscriptionPlan.findFirst({
    where: { name: { equals: 'Free', mode: 'insensitive' } },
  });

  if (!free) {
    console.log("Creating 'Free' plan...");
    free = await prisma.subscriptionPlan.create({
      data: {
        name: 'Free',
        description: 'Plano gratuito padrão',
        price: 0,
        billingCycle: 'MONTHLY',
        maxDoctors: 1,
        features: 'Auto-created by set-free-as-default-plan.js',
        isActive: true,
        maxPatients: 50,
        maxProtocols: 10,
        maxCourses: 5,
        maxProducts: 100,
        isDefault: true,
        trialDays: 0,
      },
    });
  }

  console.log("Setting 'Free' as the sole default plan...");
  // Set Free as default and unset all other defaults
  await prisma.subscriptionPlan.updateMany({
    where: { id: { not: free.id }, isDefault: true },
    data: { isDefault: false },
  });

  await prisma.subscriptionPlan.update({
    where: { id: free.id },
    data: { isDefault: true, isActive: true },
  });

  const defaults = await prisma.subscriptionPlan.findMany({ where: { isDefault: true }, select: { id: true, name: true } });
  console.log('Current default plan(s):', defaults);
}

main()
  .catch((e) => {
    console.error('Error setting Free as default:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
