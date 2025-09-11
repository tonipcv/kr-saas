#!/usr/bin/env node
/*
  Delete a DOCTOR user by email and all clinics owned by them, including related data.
  Usage:
    node scripts/delete-doctor-and-clinics.js <email> [--dry-run]
*/

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const emailArg = process.argv[2];
  const dryRun = process.argv.includes('--dry-run');

  if (!emailArg) {
    console.error('Usage: node scripts/delete-doctor-and-clinics.js <email> [--dry-run]');
    process.exit(1);
  }

  const email = String(emailArg).toLowerCase().trim();
  console.log(`Resolving user by email: ${email}`);

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    console.log('No user found for this email. Nothing to do.');
    return;
  }

  if (user.role !== 'DOCTOR') {
    console.warn(`User found, but role is ${user.role}. Proceeding anyway as requested.`);
  }

  console.log(`User: ${user.id} | ${user.name || '-'} | role=${user.role}`);

  // Find clinics owned by this user
  const clinics = await prisma.clinic.findMany({ where: { ownerId: user.id } });
  console.log(`Found ${clinics.length} clinic(s) owned by this user.`);

  const report = { userId: user.id, email: user.email, clinics: clinics.map(c => c.id), dryRun };

  if (dryRun) {
    console.log('--- DRY RUN ---');
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // Execute ordered deletions per clinic (no single transaction to avoid abort-on-first-error)
  for (const clinic of clinics) {
    console.log(`\nDeleting clinic ${clinic.id} (${clinic.name}) and related data...`);

    const cid = clinic.id;

    const step = async (label, fn) => {
      try {
        await fn();
        console.log(` ✔ ${label}`);
      } catch (e) {
        console.warn(` ✖ ${label} (continuing)`, e?.message || e);
      }
    };

    // 1) Members
    await step('clinic_members', () => prisma.clinicMember.deleteMany({ where: { clinicId: cid } }));

    // 2) Rewards and dependents (codes, redemptions -> rewards)
    await step('referral_reward_codes', () =>
      prisma.referralRewardCode.deleteMany({ where: { reward: { clinicId: cid } } })
    );
    await step('reward_redemptions', () =>
      prisma.rewardRedemption.deleteMany({ where: { reward: { clinicId: cid } } })
    );
    await step('referral_rewards', () => prisma.referralReward.deleteMany({ where: { clinicId: cid } }));

    // 3) Referral leads
    await step('referral_leads', () => prisma.referralLead.deleteMany({ where: { clinicId: cid } }));

    // 4) Coupon templates
    await step('coupon_templates', () => prisma.couponTemplate.deleteMany({ where: { clinicId: cid } }));

    // 5) Products
    await step('products', () => prisma.products.deleteMany({ where: { clinicId: cid } }));

    // 6) Membership levels (clinic-scoped tiers)
    await step('membership_levels', () => prisma.membershipLevel.deleteMany({ where: { clinicId: cid } }));

    // 7) Onboarding templates
    await step('onboarding_templates', () => prisma.onboardingTemplate.deleteMany({ where: { clinicId: cid } }));

    // 8) Doctor-patient relationships tied to clinic
    await step('doctor_patient_relationships', () => prisma.doctorPatientRelationship.deleteMany({ where: { clinicId: cid } }));

    // 9) Purchases (if your schema has clinicId on purchases)
    await step('purchases (if present)', async () => {
      try {
        await prisma.purchase.deleteMany({ where: { clinicId: cid } });
      } catch {}
    });

    // 10) New subscriptions model
    await step('clinic_subscriptions', () => prisma.clinicSubscription.deleteMany({ where: { clinicId: cid } }));

    // 11) Legacy unified subscriptions
    await step('unified_subscriptions (legacy)', () =>
      prisma.$executeRawUnsafe(
        `DELETE FROM unified_subscriptions WHERE type = $1 AND subscriber_id = $2`,
        'CLINIC', cid
      )
    );

    // 12) Finally, the clinic itself
    await step('clinics', () => prisma.clinic.delete({ where: { id: cid } }));

    console.log(`Clinic ${clinic.id} processed.`);
  }

  // Optionally: delete doctor-owned artifacts that are not clinic-scoped (protocols/courses/etc.)
  // Many relations in schema use onDelete: Cascade, so removing the user should cascade.

  console.log('\nDeleting user and cascading relations...');
  await prisma.user.delete({ where: { id: user.id } });
  console.log('User deleted.');
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
