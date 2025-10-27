#!/usr/bin/env node

/*
  Create or update a SUPER_ADMIN user and grant access to all clinics.

  Usage examples:
    node scripts/create-super-admin.js --email x@example.com                     # dry-run
    node scripts/create-super-admin.js --email x@example.com --name "Admin" --apply
    node scripts/create-super-admin.js --email x@example.com --apply --yes        # no prompt

  What this script does (idempotent):
  - Upserts the user by email
    - If the user exists: updates role to SUPER_ADMIN (and name if provided)
    - If not: creates with a generated id and role SUPER_ADMIN
  - Ensures the user has ClinicMember entries for ALL clinics as MANAGER (does not change owners)

  Notes:
  - We do NOT transfer clinic ownership. We only add the admin as a MANAGER member to every clinic.
  - This keeps referential integrity and is reversible.
*/

const readline = require('node:readline');
const crypto = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { email: null, name: null, apply: false, yes: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--email') opts.email = args[++i];
    else if (a === '--name') opts.name = args[++i];
    else if (a === '--apply') opts.apply = true;
    else if (a === '--yes') opts.yes = true;
    else if (a === '--help' || a === '-h') return printHelpAndExit(0);
    else {
      console.warn(`Unknown option: ${a}`);
      return printHelpAndExit(1);
    }
  }
  if (!opts.email) {
    console.error('Error: --email is required');
    return printHelpAndExit(1);
  }
  return opts;
}

function printHelpAndExit(code) {
  console.log(`\nCreate or update a SUPER_ADMIN user and grant access to all clinics.\n\nUsage:\n  node scripts/create-super-admin.js --email someone@example.com [--name "Admin Name"] [--apply] [--yes]\n`);
  process.exit(code);
}

async function promptYesNo(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

async function main() {
  const { email, name, apply, yes } = parseArgs();
  console.log('--- Create SUPER_ADMIN ---');
  console.log(`Email: ${email}`);
  if (name) console.log(`Name: ${name}`);
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);

  // Look up user (select only safe fields to avoid legacy enum conversions)
  let user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
  const willCreate = !user;
  const plannedUserId = user?.id || crypto.randomUUID();

  // Clinics list
  const clinics = await prisma.clinic.findMany({ select: { id: true, name: true, slug: true } });

  console.log('\nPlanned actions:');
  if (willCreate) {
    console.log(`- Create user id=${plannedUserId} email=${email} role=SUPER_ADMIN` + (name ? ` name="${name}"` : ''));
  } else {
    console.log(`- Update user id=${user.id} email=${email} -> role=SUPER_ADMIN` + (name ? `, name="${name}"` : ''));
  }
  console.log(`- Ensure MANAGER membership in all ${clinics.length} clinic(s)`);

  if (!apply) {
    console.log('\nDry-run complete. No changes performed.');
    return;
  }

  if (!yes) {
    const confirmed = await promptYesNo('Proceed with the actions above?');
    if (!confirmed) {
      console.log('Aborted by user.');
      return;
    }
  }

  await prisma.$transaction(async (tx) => {
    // Upsert SUPER_ADMIN
    if (willCreate) {
      const created = await tx.user.create({
        data: {
          id: plannedUserId,
          email,
          name: name || null,
          role: 'SUPER_ADMIN',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
        select: { id: true, email: true },
      });
      user = created;
    } else {
      const updated = await tx.user.update({
        where: { id: user.id },
        data: {
          role: 'SUPER_ADMIN',
          ...(name ? { name } : {}),
          updated_at: new Date(),
        },
        select: { id: true, email: true },
      });
      user = updated;
    }

    // Ensure MANAGER membership across all clinics
    if (clinics.length > 0) {
      const existing = await tx.clinicMember.findMany({
        where: { userId: user.id },
        select: { clinicId: true },
      });
      const existingSet = new Set(existing.map((m) => m.clinicId));

      for (const c of clinics) {
        if (!existingSet.has(c.id)) {
          await tx.clinicMember.create({
            data: {
              clinicId: c.id,
              userId: user.id,
              role: 'MANAGER',
              isActive: true,
              joinedAt: new Date(),
            },
          });
        }
      }
    }
  });

  console.log('\nDone. User is SUPER_ADMIN and has MANAGER membership in all clinics.');
}

main()
  .catch((err) => {
    console.error('Failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await prisma.$disconnect(); } catch {}
  });
