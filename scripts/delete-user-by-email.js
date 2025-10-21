#!/usr/bin/env node

/*
  Delete a user by email, with safety checks.

  Usage examples:
    node scripts/delete-user-by-email.js --email someone@example.com           # dry-run (default)
    node scripts/delete-user-by-email.js --email someone@example.com --apply   # execute, ask to confirm
    node scripts/delete-user-by-email.js --email someone@example.com --apply --yes  # execute without prompt

  Options:
    --email <email>                Email of the user to delete (required)
    --apply                        Actually perform the deletion (default is dry-run)
    --yes                          Skip confirmation prompt (only with --apply)
    --allow-doctor-unlink          If set, will unlink (set to NULL) any users referencing this user via doctor_id before deletion

  Safety rules:
    - If the user owns clinics (Clinic.ownerId == user.id), deletion is blocked and the script aborts.
      Deleting clinics is intentionally NOT automated here due to complex dependencies on products, merchants, etc.
    - If other users reference this user via doctor_id, deletion is blocked unless --allow-doctor-unlink is passed,
      in which case those references will be set to NULL in a preliminary step.

  Notes:
    - Most other relations are configured with ON DELETE CASCADE or SET NULL in Prisma schema and will be handled by Prisma/Postgres.
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
  const opts = {
    email: null,
    apply: false,
    yes: false,
    allowDoctorUnlink: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--email') {
      opts.email = args[++i];
    } else if (a === '--apply') {
      opts.apply = true;
    } else if (a === '--yes') {
      opts.yes = true;
    } else if (a === '--allow-doctor-unlink') {
      opts.allowDoctorUnlink = true;
    } else if (a === '--help' || a === '-h') {
      printHelpAndExit(0);
    } else {
      console.warn(`Unknown option: ${a}`);
      printHelpAndExit(1);
    }
  }
  if (!opts.email) {
    console.error('Error: --email is required');
    printHelpAndExit(1);
  }
  return opts;
}

function printHelpAndExit(code) {
  console.log(`\nDelete a user by email (safe).\n\nUsage:\n  node scripts/delete-user-by-email.js --email someone@example.com [--apply] [--yes] [--allow-doctor-unlink]\n\nOptions:\n  --email <email>              Email of the user to delete (required)\n  --apply                      Actually perform the deletion (otherwise dry-run)\n  --yes                        Skip confirmation prompt (only with --apply)\n  --allow-doctor-unlink        Unlink users referencing this user via doctor_id before deletion\n  -h, --help                   Show this help\n`);
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
  const { email, apply, yes, allowDoctorUnlink } = opts;

  console.log('--- Delete User by Email ---');
  console.log(`Email: ${email}`);
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);
  if (apply && allowDoctorUnlink) console.log('Option: allow-doctor-unlink ENABLED');

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });
  if (!user) {
    console.error('User not found. Nothing to do.');
    return;
  }

  // Pre-checks for blocking dependencies
  const [ownedClinicsCount, doctorRefCount] = await Promise.all([
    prisma.clinic.count({ where: { ownerId: user.id } }),
    prisma.user.count({ where: { doctor_id: user.id } }),
  ]);

  console.log('\nPre-checks:');
  console.log(`- Clinics owned by this user: ${ownedClinicsCount}`);
  console.log(`- Other users referencing as doctor (doctor_id): ${doctorRefCount}`);

  if (ownedClinicsCount > 0) {
    const ownedClinics = await prisma.clinic.findMany({
      where: { ownerId: user.id },
      select: { id: true, name: true, slug: true },
      orderBy: { createdAt: 'asc' },
    });
    console.log('\nOwned clinics:');
    for (const c of ownedClinics) {
      console.log(`- ${c.id} | ${c.name}${c.slug ? ` | slug=${c.slug}` : ''}`);
    }
  }

  let blocked = false;
  const actions = [];

  if (ownedClinicsCount > 0) {
    console.error('\nBLOCKER: This user owns one or more clinics (Clinic.ownerId).');
    console.error('This script intentionally does NOT delete clinics due to complex dependencies.');
    console.error('Please transfer clinic ownership or manually remove the clinics before deleting this user.');
    blocked = true;
  }

  if (doctorRefCount > 0 && !allowDoctorUnlink) {
    console.error('\nBLOCKER: There are users referencing this user via doctor_id.');
    console.error('Re-run with --allow-doctor-unlink to set doctor_id = NULL for those users prior to deletion.');
    blocked = true;
  } else if (doctorRefCount > 0 && allowDoctorUnlink) {
    actions.push({ type: 'unlink-doctor', count: doctorRefCount });
  }

  // Summarize plan
  console.log('\nPlanned actions:');
  if (blocked) {
    console.log('- ABORT (due to blockers reported above)');
  } else {
    if (actions.some(a => a.type === 'unlink-doctor')) {
      const a = actions.find(a => a.type === 'unlink-doctor');
      console.log(`- Unlink ${a.count} user(s): set doctor_id = NULL where doctor_id = ${user.id}`);
    }
    console.log(`- Delete user ${user.id} (${user.email})`);
  }

  if (!apply || blocked) {
    console.log(`\nDry-run complete. ${blocked ? 'Deletion is blocked.' : 'No changes performed.'}`);
    return;
  }

  // Confirm
  if (!yes) {
    const confirmed = await promptYesNo('Are you sure you want to proceed with the actions above?');
    if (!confirmed) {
      console.log('Aborted by user.');
      return;
    }
  }

  // Execute in a transaction
  await prisma.$transaction(async (tx) => {
    if (actions.some(a => a.type === 'unlink-doctor')) {
      await tx.user.updateMany({
        where: { doctor_id: user.id },
        data: { doctor_id: null },
      });
    }

    // Use deleteMany to avoid returning the full deleted row payload
    await tx.user.deleteMany({ where: { id: user.id } });
  });

  console.log('User deleted successfully.');
}

main()
  .catch((err) => {
    console.error('Failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await prisma.$disconnect(); } catch {}
  });
