/*
  Node diagnostic + fixer for Offer.preferredProvider mismatches (schema/DB/Prisma Client)

  Usage:
    node scripts/diagnostics/check_and_fix_offer_preferred_provider.js
    node scripts/diagnostics/check_and_fix_offer_preferred_provider.js --fix
    node scripts/diagnostics/check_and_fix_offer_preferred_provider.js --fix --generate

  What it does:
  - Checks if Prisma Client knows Offer.preferredProvider (client-generation check)
  - Checks if DB table `offers` has column `preferred_provider`
  - Checks if DB table `payment_routing_rules` exists
  - With --fix: adds `preferred_provider` column to `offers` if missing
  - With --generate: attempts to run `npx prisma generate` after DB fix
*/

const { PrismaClient } = require('@prisma/client');
const cp = require('child_process');

const prisma = new PrismaClient();

async function hasColumn(tableName, columnName) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
    tableName,
    columnName
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function tableExists(tableName, schema = 'public') {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
    schema,
    tableName
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function clientKnowsPreferredProvider() {
  try {
    // This will throw if client doesn't know the field
    await prisma.offer.findFirst({ select: { preferredProvider: true }, where: {} });
    return true;
  } catch (e) {
    const msg = String(e && e.message || e);
    if (msg.includes('Unknown field') && msg.includes('preferredProvider')) return false;
    // If some other error, just surface it as unknown
    return { error: msg };
  }
}

async function fixDbColumn() {
  const has = await hasColumn('offers', 'preferred_provider');
  if (has) {
    return { changed: false, note: 'Column offers.preferred_provider already exists' };
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE offers ADD COLUMN IF NOT EXISTS preferred_provider TEXT`);
  return { changed: true, note: 'Added offers.preferred_provider (TEXT)' };
}

async function runPrismaGenerate() {
  try {
    cp.execSync('npx prisma generate', { stdio: 'inherit' });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

(async function main() {
  const args = new Set(process.argv.slice(2));
  const wantFix = args.has('--fix');
  const wantGenerate = args.has('--generate');

  const out = { checks: {}, actions: [] };

  try {
    // 1) Client knowledge
    const knows = await clientKnowsPreferredProvider();
    out.checks.clientKnowsPreferredProvider = knows === true ? 'yes' : (knows === false ? 'no' : `error: ${knows.error}`);

    // 2) DB columns/tables
    out.checks.offers_has_preferred_provider = (await hasColumn('offers', 'preferred_provider')) ? 'yes' : 'no';
    out.checks.payment_routing_rules_exists = (await tableExists('payment_routing_rules')) ? 'yes' : 'no';

    // 3) Summary
    console.log('\n=== Diagnostics: Offer.preferredProvider ===');
    console.table(out.checks);

    // 4) Fix
    if (wantFix) {
      console.log('\n--fix requested: applying fixes');
      const res = await fixDbColumn();
      out.actions.push(res.note);
      console.log('DB:', res.note);

      if (wantGenerate) {
        console.log('Running: npx prisma generate');
        const gen = await runPrismaGenerate();
        out.actions.push(gen.ok ? 'Prisma generate OK' : `Prisma generate FAILED: ${gen.error}`);
      } else {
        out.actions.push('Skipped prisma generate (pass --generate to run)');
      }
    } else {
      out.actions.push('No changes applied (run with --fix to modify DB)');
    }

    console.log('\n=== Result ===');
    console.log(JSON.stringify(out, null, 2));
    if (out.checks.clientKnowsPreferredProvider !== 'yes') process.exitCode = 2;
  } catch (e) {
    console.error('ERROR:', e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
