/*
Usage examples:

node scripts/create-subscription.js \
  --type=CLINIC \
  --subscriber=cmeig09r90001t9yw8goen80q \
  --plan=cmeifw7nm0000t9e06l3t8i8o \
  --status=TRIAL \
  --trialDays=7

node scripts/create-subscription.js \
  --type=DOCTOR \
  --subscriber=<userId> \
  --plan=<planId> \
  --status=ACTIVE
*/

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (const a of args) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

async function main() {
  const {
    type = 'CLINIC',
    subscriber,
    plan,
    status = 'TRIAL',
    trialDays,
    trialEnd, // optional ISO date override
    endDate,  // optional ISO date override
    autoRenew,
  } = parseArgs();

  if (!subscriber || !plan) {
    console.error('Missing required flags: --subscriber=<id> --plan=<planId>');
    process.exit(1);
  }

  if (!['CLINIC', 'DOCTOR'].includes(type)) {
    console.error('Invalid --type. Use CLINIC or DOCTOR');
    process.exit(1);
  }

  // Validate plan exists and is active
  const planRow = await prisma.subscriptionPlan.findUnique({
    where: { id: plan },
    select: { id: true, name: true, isActive: true, trialDays: true },
  });
  if (!planRow) {
    console.error(`Plan not found: ${plan}`);
    process.exit(1);
  }
  if (!planRow.isActive) {
    console.warn(`Warning: plan ${planRow.id} (${planRow.name}) is not active.`);
  }

  // If CLINIC type, ensure clinic exists; if DOCTOR, ensure user exists
  if (type === 'CLINIC') {
    const clinic = await prisma.clinic.findUnique({ where: { id: subscriber }, select: { id: true, name: true } });
    if (!clinic) {
      console.error(`Clinic not found: ${subscriber}`);
      process.exit(1);
    }
  } else {
    const user = await prisma.user.findUnique({ where: { id: subscriber }, select: { id: true, name: true } });
    if (!user) {
      console.error(`User (doctor) not found: ${subscriber}`);
      process.exit(1);
    }
  }

  // Compute dates
  const now = new Date();
  const trialDaysInt = trialDays ? parseInt(trialDays, 10) : (planRow.trialDays ?? 7);
  const trial_end_date = trialEnd ? new Date(trialEnd) : (status === 'TRIAL' ? addDays(now, trialDaysInt) : null);
  const end_date = endDate ? new Date(endDate) : null;
  const auto_renew = typeof autoRenew === 'string' ? autoRenew === 'true' : true;

  // Check if there is an existing subscription for (subscriber, type)
  const existing = await prisma.unified_subscriptions.findFirst({
    where: { subscriber_id: subscriber, type },
  });

  let result;
  if (existing) {
    result = await prisma.unified_subscriptions.update({
      where: { id: existing.id },
      data: {
        plan_id: plan,
        status,
        start_date: now,
        trial_end_date,
        end_date,
        auto_renew,
        updated_at: now,
      },
    });
    console.log('Updated existing subscription:', result);
  } else {
    result = await prisma.unified_subscriptions.create({
      data: {
        id: require('crypto').randomUUID(),
        type, // enum subscription_type
        subscriber_id: subscriber,
        plan_id: plan,
        status, // e.g., 'TRIAL' or 'ACTIVE'
        start_date: now,
        trial_end_date,
        end_date,
        auto_renew,
      },
    });
    console.log('Created new subscription:', result);
  }

  console.log('\nDone. Verify via GET /api/subscription/current');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
