#!/usr/bin/env node

/*
  Migrates all doctors/clinics to the Free plan in unified_subscriptions.
  - Ensures each doctor has a clinic (creates one if missing).
  - Upserts unified_subscriptions (type=CLINIC) to Free plan with ACTIVE status.

  Usage:
    node scripts/migrate-doctors-to-free-plan.js
*/

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function ensureClinicIdEqualsDoctor(doctor) {
  // Ensure a clinic exists whose primary key equals the doctor's id
  let clinic = await prisma.clinic.findUnique({ where: { id: doctor.id } });
  if (clinic) return clinic;

  // Create minimal clinic with the same id as the doctor
  clinic = await prisma.clinic.create({
    data: {
      id: doctor.id,
      name: `${doctor.name || 'Clínica'} - ${doctor.email}`.slice(0, 255),
      ownerId: doctor.id,
      isActive: true,
    },
    select: { id: true }
  });

  // Ensure membership
  await prisma.clinicMember.upsert({
    where: { clinicId_userId: { clinicId: clinic.id, userId: doctor.id } },
    create: { clinicId: clinic.id, userId: doctor.id, role: 'ADMIN', isActive: true },
    update: { isActive: true, role: 'ADMIN' }
  });

  return clinic;
}

async function upsertClinicFreeSubscriptionForDoctor(doctor, freePlan) {
  const now = new Date();
  // Ensure mirrored clinic
  await ensureClinicIdEqualsDoctor(doctor);
  // Use compound unique key subscriber_id + type
  const where = { subscriber_id_type: { subscriber_id: doctor.id, type: 'CLINIC' } };

  // Check existing first to decide create/update cleanly
  const existing = await prisma.unified_subscriptions.findUnique({ where }).catch(() => null);

  if (existing) {
    return prisma.unified_subscriptions.update({
      where,
      data: {
        plan_id: freePlan.id,
        status: 'ACTIVE',
        trial_end_date: null,
        end_date: null,
        auto_renew: true,
        max_doctors: freePlan.maxDoctors ?? 1,
        updated_at: now,
      },
      select: { id: true, status: true, plan_id: true }
    });
  }

  return prisma.unified_subscriptions.create({
    data: {
      id: require('crypto').randomUUID(),
      type: 'CLINIC',
      subscriber_id: doctor.id,
      plan_id: freePlan.id,
      status: 'ACTIVE',
      start_date: now,
      trial_end_date: null,
      auto_renew: true,
      max_doctors: freePlan.maxDoctors ?? 1,
    },
    select: { id: true, status: true, plan_id: true }
  });
}

async function main() {
  const freePlan = await prisma.subscriptionPlan.findFirst({ where: { name: 'Free', isActive: true } });
  if (!freePlan) {
    throw new Error('Free plan not found. Run scripts/seed-subscription-plans.js first.');
  }

  const doctors = await prisma.user.findMany({ where: { role: 'DOCTOR' }, select: { id: true, name: true, email: true } });
  console.log(`Found ${doctors.length} doctors.`);

  let migrated = 0;
  for (const doctor of doctors) {
    try {
      await upsertClinicFreeSubscriptionForDoctor(doctor, freePlan);
      migrated++;
      if (migrated % 10 === 0) console.log(`Migrated ${migrated}/${doctors.length}...`);
    } catch (e) {
      console.error(`Failed for doctor ${doctor.id} (${doctor.email}):`, e.message);
    }
  }

  console.log(`Done. Migrated ${migrated} doctors to Free plan (clinic subscriptions).`);
}

main()
  .catch((e) => {
    console.error('Migration error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
