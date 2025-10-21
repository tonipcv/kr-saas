#!/usr/bin/env node

/*
  Delete a clinic safely by id or slug, with dry-run and confirmation.

  Usage examples:
    node scripts/delete-clinic.js --slug minha-clinica             # dry-run (default)
    node scripts/delete-clinic.js --id ck123                        # dry-run
    node scripts/delete-clinic.js --slug minha-clinica --apply      # execute, ask to confirm
    node scripts/delete-clinic.js --slug minha-clinica --apply --yes

  What this does (default strategy: set-null where possible, delete required dependents):
    - Delete Merchant for the clinic (required relation)
    - Delete ClinicAddOnSubscription linked to the clinic's subscriptions
    - Delete ClinicSubscription for the clinic
    - Set clinicId = NULL on related optional references:
        * products.clinicId
        * ReferralLead.clinicId
        * CouponTemplate.clinicId
        * ReferralReward.clinicId
    - Finally delete the Clinic

  Notes:
    - Other relations like ClinicMember are configured with ON DELETE CASCADE in schema.
    - Events store uses plain clinicId (no FK), left untouched.
*/

const readline = require('node:readline');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL },
  },
});

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { id: null, slug: null, apply: false, yes: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--id') opts.id = args[++i];
    else if (a === '--slug') opts.slug = args[++i];
    else if (a === '--apply') opts.apply = true;
    else if (a === '--yes') opts.yes = true;
    else if (a === '--help' || a === '-h') printHelpAndExit(0);
    else {
      console.warn(`Unknown option: ${a}`);
      printHelpAndExit(1);
    }
  }
  if (!opts.id && !opts.slug) {
    console.error('Error: provide --id or --slug');
    printHelpAndExit(1);
  }
  return opts;
}

function printHelpAndExit(code) {
  console.log(`\nDelete a clinic safely (by id or slug).\n\nUsage:\n  node scripts/delete-clinic.js --id <clinicId> [--apply] [--yes]\n  node scripts/delete-clinic.js --slug <clinicSlug> [--apply] [--yes]\n`);
  process.exit(code);
}

async function promptYesNo(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()))
    });
  });
}

async function main() {
  const opts = parseArgs();
  const { id, slug, apply, yes } = opts;

  console.log('--- Delete Clinic ---');
  if (id) console.log(`Clinic ID: ${id}`);
  if (slug) console.log(`Clinic Slug: ${slug}`);
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);

  // Locate clinic
  const clinic = await prisma.clinic.findFirst({
    where: { OR: [ id ? { id } : undefined, slug ? { slug } : undefined ].filter(Boolean) },
    select: { id: true, name: true, slug: true },
  });
  if (!clinic) {
    console.error('Clinic not found. Nothing to do.');
    return;
  }

  console.log(`\nClinic: ${clinic.id} | ${clinic.name}${clinic.slug ? ` | slug=${clinic.slug}` : ''}`);

  // Gather dependent counts
  const [
    merchant,
    subs,
    addonSubsCount,
    productsCount,
    referralLeadsCount,
    couponTemplatesCount,
    referralRewardsCount,
    membersCount,
  ] = await Promise.all([
    prisma.merchant.findUnique({ where: { clinicId: clinic.id }, select: { id: true } }),
    prisma.clinicSubscription.findMany({ where: { clinicId: clinic.id }, select: { id: true } }),
    prisma.clinicAddOnSubscription.count({ where: { subscription: { clinicId: clinic.id } } }),
    prisma.products.count({ where: { clinicId: clinic.id } }),
    prisma.referralLead.count({ where: { clinicId: clinic.id } }),
    prisma.couponTemplate.count({ where: { clinicId: clinic.id } }),
    prisma.referralReward.count({ where: { clinicId: clinic.id } }),
    prisma.clinicMember.count({ where: { clinicId: clinic.id } }),
  ]);

  console.log('\nDependencies:');
  console.log(`- Merchant: ${merchant ? 'YES' : 'NO'}`);
  console.log(`- Subscriptions: ${subs.length}`);
  console.log(`- AddOn Subscriptions (via subscriptions): ${addonSubsCount}`);
  console.log(`- Products with clinicId: ${productsCount}`);
  console.log(`- ReferralLeads with clinicId: ${referralLeadsCount}`);
  console.log(`- CouponTemplates with clinicId: ${couponTemplatesCount}`);
  console.log(`- ReferralRewards with clinicId: ${referralRewardsCount}`);
  console.log(`- Clinic Members: ${membersCount} (will be removed by cascade)`);

  console.log('\nPlanned actions:');
  if (merchant) console.log('- Delete Merchant');
  if (addonSubsCount > 0) console.log('- Delete ClinicAddOnSubscription for all subscriptions');
  if (subs.length > 0) console.log('- Delete ClinicSubscription');
  if (productsCount > 0) console.log('- Set products.clinicId = NULL');
  if (referralLeadsCount > 0) console.log('- Set referral_leads.clinic_id = NULL');
  if (couponTemplatesCount > 0) console.log('- Set coupon_templates.clinic_id = NULL');
  if (referralRewardsCount > 0) console.log('- Set referral_rewards.clinic_id = NULL');
  console.log('- Delete Clinic');

  if (!apply) {
    console.log('\nDry-run complete. No changes performed.');
    return;
  }

  if (!yes) {
    const confirmed = await promptYesNo('Are you sure you want to perform the actions above?');
    if (!confirmed) {
      console.log('Aborted by user.');
      return;
    }
  }

  await prisma.$transaction(async (tx) => {
    if (addonSubsCount > 0) {
      const subIds = subs.map(s => s.id);
      if (subIds.length > 0) {
        await tx.clinicAddOnSubscription.deleteMany({ where: { subscriptionId: { in: subIds } } });
      }
    }

    if (subs.length > 0) {
      await tx.clinicSubscription.deleteMany({ where: { clinicId: clinic.id } });
    }

    if (merchant) {
      await tx.merchant.delete({ where: { clinicId: clinic.id } });
    }

    if (productsCount > 0) {
      await tx.products.updateMany({ where: { clinicId: clinic.id }, data: { clinicId: null } });
    }

    if (referralLeadsCount > 0) {
      await tx.referralLead.updateMany({ where: { clinicId: clinic.id }, data: { clinicId: null } });
    }

    if (couponTemplatesCount > 0) {
      await tx.couponTemplate.updateMany({ where: { clinicId: clinic.id }, data: { clinicId: null } });
    }

    if (referralRewardsCount > 0) {
      await tx.referralReward.updateMany({ where: { clinicId: clinic.id }, data: { clinicId: null } });
    }

    await tx.clinic.delete({ where: { id: clinic.id } });
  });

  console.log('Clinic deleted successfully.');
}

main()
  .catch((err) => {
    console.error('Failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await prisma.$disconnect(); } catch {}
  });
