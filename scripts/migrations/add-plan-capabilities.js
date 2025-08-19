// scripts/migrations/add-plan-capabilities.js
// Adds new capability columns to subscription_plans and backfills Free/Starter/Creator values.
// This script is idempotent and embeds the SQL, so no separate .sql file is needed.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function applySqlDDL() {
  const stmts = [
    'ALTER TABLE "subscription_plans" ADD COLUMN IF NOT EXISTS "referralsMonthlyLimit" INTEGER',
    'ALTER TABLE "subscription_plans" ADD COLUMN IF NOT EXISTS "maxRewards" INTEGER',
    'ALTER TABLE "subscription_plans" ADD COLUMN IF NOT EXISTS "allowCreditPerPurchase" BOOLEAN DEFAULT FALSE',
    'ALTER TABLE "subscription_plans" ADD COLUMN IF NOT EXISTS "allowCampaigns" BOOLEAN DEFAULT FALSE',
  ];
  for (const sql of stmts) {
    await prisma.$executeRawUnsafe(sql);
  }
  console.log('DDL applied (or already present).');
}

async function findPlanByName(name) {
  return prisma.subscriptionPlan.findFirst({ where: { name } });
}

async function createBasicPlan(name, price, options = {}) {
  // Create plan with existing known columns only
  return prisma.subscriptionPlan.create({
    data: {
      name,
      price,
      description: options.description ?? null,
      trialDays: options.trialDays ?? 0,
      maxPatients: options.maxPatients ?? null,
      maxProtocols: options.maxProtocols ?? null,
      maxCourses: options.maxCourses ?? null,
      maxProducts: options.maxProducts ?? null,
      isDefault: options.isDefault ?? false,
    },
  });
}

async function updatePlanNewFieldsById(planId, fields) {
  const sets = [];
  const args = [];
  if (fields.referralsMonthlyLimit !== undefined) {
    sets.push('"referralsMonthlyLimit" = $' + (args.length + 1));
    args.push(fields.referralsMonthlyLimit);
  }
  if (fields.maxRewards !== undefined) {
    sets.push('"maxRewards" = $' + (args.length + 1));
    args.push(fields.maxRewards);
  }
  if (fields.allowCreditPerPurchase !== undefined) {
    sets.push('"allowCreditPerPurchase" = $' + (args.length + 1));
    args.push(fields.allowCreditPerPurchase);
  }
  if (fields.allowCampaigns !== undefined) {
    sets.push('"allowCampaigns" = $' + (args.length + 1));
    args.push(fields.allowCampaigns);
  }
  if (sets.length === 0) return;
  args.push(planId);
  const sql = `UPDATE "subscription_plans" SET ${sets.join(', ')} WHERE id = $${args.length}`;
  await prisma.$executeRawUnsafe(sql, ...args);
}

async function unsetAllDefaults() {
  await prisma.subscriptionPlan.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
}

async function deactivatePremiumPlans() {
  const sql = `UPDATE "subscription_plans" SET "isActive" = FALSE WHERE LOWER(name) LIKE '%premium%' AND "isActive" = TRUE`;
  const res = await prisma.$executeRawUnsafe(sql);
  console.log('Premium plans deactivated (if any).');
  return res;
}

async function backfillPlans() {
  // Ensure Free is default at the end
  await unsetAllDefaults();

  // Free
  let free = await findPlanByName('Free');
  if (!free) {
    free = await createBasicPlan('Free', 0, {
      trialDays: 7,
      maxPatients: 10,
      isDefault: true,
    });
  } else {
    // Normalize existing Free plan core fields
    await prisma.subscriptionPlan.update({
      where: { id: free.id },
      data: {
        price: 0,
        trialDays: 7,
        maxPatients: 10,
        isDefault: true,
        isActive: true,
      },
    });
  }
  await updatePlanNewFieldsById(free.id, {
    referralsMonthlyLimit: 100,
    maxRewards: 10,
    allowCreditPerPurchase: false,
    allowCampaigns: false,
  });

  // Starter
  let starter = await findPlanByName('Starter');
  if (!starter) {
    starter = await createBasicPlan('Starter', 40, {
      trialDays: 7,
      maxPatients: 100,
      isDefault: false,
    });
  } else {
    // Normalize existing Starter plan core fields
    await prisma.subscriptionPlan.update({
      where: { id: starter.id },
      data: {
        price: 40,
        trialDays: 7,
        maxPatients: 100,
        isDefault: false,
        isActive: true,
      },
    });
  }
  await updatePlanNewFieldsById(starter.id, {
    referralsMonthlyLimit: 500,
    maxRewards: 50,
    allowCreditPerPurchase: true,
    allowCampaigns: false,
  });

  // Creator
  let creator = await findPlanByName('Creator');
  if (!creator) {
    creator = await createBasicPlan('Creator', 197, {
      trialDays: 0, // set to 7 if desired
      maxPatients: 1000,
      isDefault: false,
    });
  } else {
    // Normalize existing Creator plan core fields
    await prisma.subscriptionPlan.update({
      where: { id: creator.id },
      data: {
        price: 197,
        trialDays: 0,
        maxPatients: 1000,
        isDefault: false,
        isActive: true,
      },
    });
  }
  await updatePlanNewFieldsById(creator.id, {
    referralsMonthlyLimit: 2000,
    maxRewards: 50,
    allowCreditPerPurchase: true,
    allowCampaigns: false,
  });

  await deactivatePremiumPlans();

  // Guarantee only Free is default
  free = await findPlanByName('Free');
  if (free && !free.isDefault) {
    await prisma.subscriptionPlan.update({ where: { id: free.id }, data: { isDefault: true } });
  }
}

async function main() {
  try {
    console.log('Starting plan capabilities migration...');
    await applySqlDDL();
    await backfillPlans();
    console.log('Plan capabilities migration completed.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}
