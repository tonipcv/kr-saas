// Ensure every doctor has a FREE non-expiring subscription
// Usage: node scripts/ensure-free-doctor-subscriptions.js

const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

async function main() {
  console.log('Ensuring FREE plan exists...');
  // Try to find by name 'Free'
  let freePlan = await prisma.subscriptionPlan.findFirst({
    where: { name: { equals: 'Free', mode: 'insensitive' } },
  });

  if (!freePlan) {
    console.log('Creating FREE plan...');
    freePlan = await prisma.subscriptionPlan.create({
      data: {
        name: 'Free',
        description: 'Default free plan for doctors without explicit subscription',
        price: 0,
        billingCycle: 'MONTHLY',
        maxDoctors: 1,
        features: 'Auto-created by ensure-free-doctor-subscriptions.js',
        isActive: true,
        maxPatients: 50,
        maxProtocols: 10,
        maxCourses: 5,
        maxProducts: 100,
        isDefault: false,
        trialDays: 0,
      },
    });
  }

  console.log('Fetching doctors...');
  const doctors = await prisma.user.findMany({
    where: { role: 'DOCTOR' },
    select: { id: true, email: true, name: true },
  });

  if (doctors.length === 0) {
    console.log('No doctors found. Nothing to do.');
    return;
  }

  const doctorIds = doctors.map((d) => d.id);

  console.log('Fetching existing doctor subscriptions...');
  const existingSubs = await prisma.unified_subscriptions.findMany({
    where: { type: 'DOCTOR', subscriber_id: { in: doctorIds } },
    select: { subscriber_id: true },
  });

  const hasSub = new Set(existingSubs.map((s) => s.subscriber_id));

  const missing = doctors.filter((d) => !hasSub.has(d.id));

  console.log(`Doctors without subscription: ${missing.length}`);

  for (const doc of missing) {
    console.log(`Creating FREE subscription for doctor ${doc.id} (${doc.email || doc.name || 'no-name'})`);
    await prisma.unified_subscriptions.create({
      data: {
        id: crypto.randomUUID(),
        type: 'DOCTOR',
        subscriber_id: doc.id,
        plan_id: freePlan.id,
        status: 'ACTIVE',
        start_date: new Date(),
        end_date: null,
        trial_end_date: null,
        auto_renew: true,
      },
    });
  }

  console.log('Done. Ensured FREE subscriptions for all doctors.');
}

main()
  .catch((e) => {
    console.error('Error ensuring FREE subscriptions:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
