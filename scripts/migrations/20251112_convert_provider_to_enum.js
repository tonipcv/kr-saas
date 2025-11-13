/*
  Convert provider columns to native Postgres enum 'paymentprovider'
  Safe, idempotent migration for:
    - payment_routing_rules.provider (TEXT -> paymentprovider)
    - offers.preferred_provider (TEXT -> paymentprovider)

  Usage:
    node scripts/migrations/20251112_convert_provider_to_enum.js
*/

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ALLOWED = [
  'KRXPAY',
  'STRIPE',
  'ADYEN',
  'PAYPAL',
  'MERCADOPAGO',
  'PAGARME',
  'OPENFINANCE',
];

async function columnExists(table, column) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    table,
    column
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function ensureEnumExists() {
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'paymentprovider') THEN
        CREATE TYPE paymentprovider AS ENUM ('KRXPAY','STRIPE','ADYEN','PAYPAL','MERCADOPAGO','PAGARME','OPENFINANCE');
      END IF;
    END$$;
  `);
}

async function validateValues(table, column) {
  if (!(await columnExists(table, column))) return;
  const bad = await prisma.$queryRawUnsafe(
    `SELECT id, ${column} AS val FROM ${table} WHERE ${column} IS NOT NULL AND ${column} NOT IN (${ALLOWED.map((_, i) => `$${i + 1}`).join(',')})`,
    ...ALLOWED
  );
  if (bad.length) {
    const vals = [...new Set(bad.map((r) => r.val))].join(', ');
    throw new Error(`${table}.${column} has invalid values: ${vals}`);
  }
}

async function alterToEnum(table, column) {
  if (!(await columnExists(table, column))) return { changed: false, note: `${table}.${column} missing, skipped` };
  await prisma.$executeRawUnsafe(`
    ALTER TABLE ${table}
    ALTER COLUMN ${column} TYPE paymentprovider
    USING CASE WHEN ${column} IS NULL THEN NULL ELSE ${column}::paymentprovider END
  `);
  return { changed: true, note: `${table}.${column} converted to enum paymentprovider` };
}

async function up() {
  const out = { actions: [] };
  try {
    await ensureEnumExists();
    // Validate BEFORE altering
    await validateValues('payment_routing_rules', 'provider');
    await validateValues('offers', 'preferred_provider');

    // Alter columns (only if present)
    const r1 = await alterToEnum('payment_routing_rules', 'provider');
    const r2 = await alterToEnum('offers', 'preferred_provider');
    out.actions.push(r1.note, r2.note);

    console.log('✅ Migration completed');
    console.log(JSON.stringify(out, null, 2));
  } catch (e) {
    console.error('❌ Migration failed:', e.message || e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

up();
