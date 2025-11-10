/*
  Adds a UNIQUE index on (user_id, organisation_id) to enrollment_contexts.
  - Uses @prisma/client and DATABASE_URL from env
  - Fails fast if duplicates exist and prints sample duplicates
  - Safe to re-run (IF NOT EXISTS)
*/

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('[migration] Checking duplicates in enrollment_contexts (user_id, organisation_id) ...');
  const dups = await prisma.$queryRawUnsafe(`
    SELECT user_id, organisation_id, COUNT(*) AS c
    FROM enrollment_contexts
    GROUP BY user_id, organisation_id
    HAVING COUNT(*) > 1
    ORDER BY c DESC
    LIMIT 20
  `);

  if (Array.isArray(dups) && dups.length > 0) {
    console.error('[migration] ❌ Found duplicates. Cannot create UNIQUE index until resolved. Sample:', dups);
    console.error('[migration] You must consolidate or remove duplicates for the pairs above.');
    process.exitCode = 2;
    await prisma.$disconnect().catch(() => {});
    return;
  }

  console.log('[migration] Creating UNIQUE INDEX IF NOT EXISTS enrollment_contexts_user_org_uniq ...');
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS enrollment_contexts_user_org_uniq
    ON enrollment_contexts (user_id, organisation_id);
  `);

  console.log('[migration] ✅ Done.');
}

main()
  .catch((e) => {
    console.error('[migration] Error:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
