#!/usr/bin/env node
/*
  Migrate legacy "Free" ClinicPlan usage to real plans with TRIAL status.

  What it does (dry-run by default):
  - Detects any ClinicPlan with name "Free" (case-insensitive) and prints stats.
  - Lists ClinicSubscriptions that point to the Free plan.
  - Suggests a target plan (default: a plan named "Starter"; can be overridden by --targetPlanId).

  When run with --apply:
  - Updates each ClinicSubscription that uses the Free plan:
      * planId -> target plan id
      * status -> TRIAL (unless overridden with --keepStatus)
      * trialEndsAt preserved if already present; otherwise sets based on target plan trialDays (default 14 if plan has no trialDays)
  - Marks the Free plan as inactive (isActive = false)

  Usage examples:
    node scripts/migrate-free-plan-to-trial.js --check
    node scripts/migrate-free-plan-to-trial.js --apply
    node scripts/migrate-free-plan-to-trial.js --apply --targetPlanId <plan_id>
    node scripts/migrate-free-plan-to-trial.js --apply --keepStatus

  Notes:
    - Safe to run multiple times; updates are idempotent.
    - Prints a detailed summary before applying changes.
*/

const { prisma } = require('../dist/lib/prisma.js');

function parseArgs(argv) {
  const args = { apply: false, keepStatus: false, targetPlanId: null, check: false, trialDaysOverride: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--keepStatus') args.keepStatus = true;
    else if (a === '--targetPlanId') args.targetPlanId = argv[++i];
    else if (a === '--trialDaysOverride') args.trialDaysOverride = parseInt(argv[++i], 10);
    else if (a === '--check') args.check = true;
  }
  return args;
}

async function findFreePlan() {
  const plan = await prisma.clinicPlan.findFirst({
    where: { name: { contains: 'free', mode: 'insensitive' } },
    include: { subscriptions: { select: { id: true } } },
  });
  return plan;
}

async function findStarterPlan() {
  const starter = await prisma.clinicPlan.findFirst({
    where: { name: { equals: 'Starter', mode: 'insensitive' } },
  });
  return starter;
}

async function getSubscriptionsByPlan(planId) {
  const subs = await prisma.clinicSubscription.findMany({
    where: { planId },
    include: {
      clinic: { select: { id: true, name: true } },
      plan: { select: { id: true, name: true, trialDays: true } },
    },
  });
  return subs;
}

async function main() {
  const args = parseArgs(process.argv);
  try {
    const freePlan = await findFreePlan();
    if (!freePlan) {
      console.log('No ClinicPlan named "Free" found. Nothing to migrate.');
      return;
    }

    const subs = await getSubscriptionsByPlan(freePlan.id);
    console.log('Detected Free plan:');
    console.log(JSON.stringify({ id: freePlan.id, name: freePlan.name, isActive: freePlan.isActive, subscriptions: subs.length }, null, 2));

    let targetPlan = null;
    if (args.targetPlanId) {
      targetPlan = await prisma.clinicPlan.findUnique({ where: { id: args.targetPlanId } });
      if (!targetPlan) {
        console.error('Target plan not found by id:', args.targetPlanId);
        process.exit(1);
      }
    } else {
      targetPlan = await findStarterPlan();
      if (!targetPlan) {
        console.error('No "Starter" plan found. Please create one or pass --targetPlanId <id>.');
        process.exit(1);
      }
    }

    console.log('\nTarget plan:');
    console.log(JSON.stringify({ id: targetPlan.id, name: targetPlan.name, trialDays: targetPlan.trialDays, isActive: targetPlan.isActive }, null, 2));
    if (args.trialDaysOverride) {
      console.log(`Using trialDaysOverride = ${args.trialDaysOverride}`);
    }

    console.log('\nSubscriptions to migrate (showing up to 50):');
    subs.slice(0, 50).forEach((s) => {
      console.log(`- sub:${s.id} clinic:${s.clinic?.name} (${s.clinicId}) plan:${s.plan?.name} status:${s.status} trialEndsAt:${s.trialEndsAt}`);
    });
    if (subs.length > 50) console.log(`... and ${subs.length - 50} more`);

    if (!args.apply) {
      console.log('\nDRY-RUN complete. Use --apply to perform the migration.');
      return;
    }

    const now = new Date();
    let updatedCount = 0;
    for (const s of subs) {
      const data = { planId: targetPlan.id };
      if (!args.keepStatus) {
        data.status = 'TRIAL';
      }
      if (!s.trialEndsAt) {
        const td = args.trialDaysOverride || targetPlan.trialDays || 14;
        const end = new Date(now.getTime() + td * 24 * 60 * 60 * 1000);
        data.trialEndsAt = end;
      }
      await prisma.clinicSubscription.update({ where: { id: s.id }, data });
      updatedCount++;
    }

    // Deactivate the Free plan so it doesn't show up
    if (freePlan.isActive) {
      await prisma.clinicPlan.update({ where: { id: freePlan.id }, data: { isActive: false } });
    }

    console.log(`\nMigration applied. Subscriptions updated: ${updatedCount}. Free plan set to inactive.`);
  } catch (err) {
    console.error('Error:', err?.message || err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
