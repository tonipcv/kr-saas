// Add missing values to Postgres enum "Currency" using Prisma
// Usage:
//   node scripts/ddl_add_missing_currencies.js
// Notes:
// - Safe to run multiple times; it checks existing labels before ALTER TYPE
// - Runs one ALTER per missing value (outside transaction), as Postgres forbids enum changes in prepared multi-statement

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Full set of currencies we support in app/countryCurrency.ts
const TARGET = [
  'USD','BRL','EUR','MXN','ARS','CLP','COP','GBP','CAD','AUD','JPY','CHF','ZAR'
];

async function getExistingEnumLabels(typeName) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT e.enumlabel AS label
     FROM pg_type t
     JOIN pg_enum e ON t.oid = e.enumtypid
     WHERE t.typname = $1
     ORDER BY e.enumsortorder`,
    typeName
  );
  return (rows || []).map(r => r.label);
}

async function addEnumValue(typeName, value) {
  // ALTER TYPE ... ADD VALUE must be executed as a single command
  await prisma.$executeRawUnsafe(`ALTER TYPE "${typeName}" ADD VALUE '${value}'`);
}

async function main() {
  const typeName = 'Currency';
  const existing = await getExistingEnumLabels(typeName);
  const missing = TARGET.filter(v => !existing.includes(v));
  if (missing.length === 0) {
    console.log(`[Currency] up-to-date. Existing: ${existing.join(', ')}`);
    return;
  }
  console.log(`[Currency] existing: ${existing.join(', ')}\n[Currency] adding: ${missing.join(', ')}`);
  for (const v of missing) {
    try {
      await addEnumValue(typeName, v);
      console.log(`+ added ${v}`);
    } catch (e) {
      console.error(`! failed to add ${v}:`, e?.message || e);
      // continue with others
    }
  }
  const after = await getExistingEnumLabels(typeName);
  console.log(`[Currency] final: ${after.join(', ')}`);
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
