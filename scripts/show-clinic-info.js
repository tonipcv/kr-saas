#!/usr/bin/env node
/*
  Show clinic information from the database via Prisma.

  Usage examples:
    node scripts/show-clinic-info.js --email xppsalvador@gmail.com
    node scripts/show-clinic-info.js --email xppsalvador@gmail.com --clinicId <clinic_id>

  Notes:
    - If clinicId is provided, it will fetch that clinic (if exists), including latest active/trial subscription and members.
    - If clinicId is not provided, it will try to infer a clinic for the user:
        * If DOCTOR: first membership or owned clinic.
        * If ADMIN/SUPER_ADMIN: first active clinic in the system.
*/

const { prisma } = require('../dist/lib/prisma.js');

function parseArgs(argv) {
  const args = { email: null, clinicId: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--email') args.email = argv[++i];
    else if (a === '--clinicId') args.clinicId = argv[++i];
  }
  return args;
}

async function loadClinicById(clinicId) {
  const clinic = await prisma.clinic.findFirst({
    where: { id: clinicId },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      members: {
        where: { isActive: true },
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
      },
      subscriptions: {
        where: { status: { in: ['ACTIVE', 'TRIAL'] } },
        include: {
          plan: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });
  if (!clinic) return null;
  const latestSub = Array.isArray(clinic.subscriptions) && clinic.subscriptions.length > 0 ? clinic.subscriptions[0] : null;
  return {
    ...clinic,
    subscription: latestSub
      ? {
          id: latestSub.id,
          status: latestSub.status,
          startDate: latestSub.startDate,
          endDate: latestSub.currentPeriodEnd,
          trialEndDate: latestSub.trialEndsAt,
          plan: latestSub.plan
            ? {
                id: latestSub.plan.id,
                name: latestSub.plan.name,
                // Prisma schema uses monthlyPrice/baseDoctors/basePatients and features JSON
                price: latestSub.plan.monthlyPrice != null ? Number(latestSub.plan.monthlyPrice) : null,
                maxDoctors: latestSub.plan.baseDoctors,
                maxPatients: latestSub.plan.basePatients,
                features: latestSub.plan.features,
              }
            : null,
        }
      : null,
  };
}

async function inferClinicForUser(user) {
  if (!user) return null;
  if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
    const c = await prisma.clinic.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!c) return null;
    return loadClinicById(c.id);
  }
  // DOCTOR: first membership
  const member = await prisma.clinicMember.findFirst({
    where: { userId: user.id, isActive: true },
    select: { clinicId: true },
  });
  if (member?.clinicId) return loadClinicById(member.clinicId);
  // fallback as owner
  const owned = await prisma.clinic.findFirst({
    where: { ownerId: user.id },
    select: { id: true },
  });
  if (owned?.id) return loadClinicById(owned.id);
  return null;
}

async function main() {
  const { email, clinicId } = parseArgs(process.argv);
  if (!email) {
    console.error('Please provide --email <email>');
    process.exit(1);
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, role: true },
    });

    if (!user) {
      console.log('User not found');
      return;
    }

    let clinic = null;
    if (clinicId) {
      clinic = await loadClinicById(clinicId);
    } else {
      clinic = await inferClinicForUser(user);
    }

    console.log('User:');
    console.log(JSON.stringify(user, null, 2));
    console.log('\nClinic:');
    console.log(JSON.stringify(clinic, null, 2));
  } catch (err) {
    console.error('Error:', err?.message || err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
