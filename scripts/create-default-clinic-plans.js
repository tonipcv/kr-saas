const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const defaultPlans = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'Perfect for solo practitioners or small clinics',
    monthlyPrice: 99.90,
    baseDoctors: 2,
    basePatients: 100,
    tier: 'STARTER',
    trialDays: 14,
    isActive: true,
    isDefault: false,
  },
  {
    id: 'growth',
    name: 'Growth',
    description: 'For growing clinics with multiple doctors',
    price: 199.90,
    maxDoctors: 5,
    maxPatients: 500,
    maxProducts: 50,
    trialDays: 14,
    isActive: true,
    isDefault: false,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For large clinics and medical centers',
    price: 499.90,
    maxDoctors: -1, // unlimited
    maxPatients: -1, // unlimited
    maxProducts: -1, // unlimited
    trialDays: 14,
    isActive: true,
    isDefault: false,
  }
];

async function main() {
  console.log('Creating default clinic plans...');

  try {
    // Create backup of existing plans
    const existingPlans = await prisma.clinicPlan.findMany();
    console.log('Existing plans:', existingPlans);

    // Upsert each plan
    for (const plan of defaultPlans) {
      await prisma.clinicPlan.upsert({
        where: { id: plan.id },
        update: plan,
        create: plan,
      });
      console.log(`Upserted plan: ${plan.name}`);
    }

    console.log('Default clinic plans created successfully!');
  } catch (error) {
    console.error('Error creating default clinic plans:', error);
    throw error;
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
