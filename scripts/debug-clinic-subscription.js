// Debug script to test clinic subscription query with Prisma
// Usage: node scripts/debug-clinic-subscription.js <clinicId>

const { PrismaClient, SubscriptionStatus } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const clinicId = process.argv[2];
  if (!clinicId) {
    console.error('Usage: node scripts/debug-clinic-subscription.js <clinicId>');
    process.exit(1);
  }

  console.log('Prisma client version:', prisma._engineConfig?.clientVersion || 'unknown');
  console.log('Clinic ID:', clinicId);

  try {
    const subscription = await prisma.clinicSubscription.findFirst({
      where: {
        clinicId,
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL] },
      },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    console.log('\nQuery result:');
    console.dir(subscription, { depth: 5 });
  } catch (err) {
    console.error('\nQuery failed:');
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
