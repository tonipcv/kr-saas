/*
  Rename Postgres enum type paymentprovider -> "PaymentProvider" to match Prisma's enum name
  and align all dependent columns.

  Usage:
    node scripts/migrations/20251112_rename_enum_paymentprovider_to_PaymentProvider.js
*/

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function enumExists(name) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT 1 FROM pg_type WHERE typname = $1`,
    name
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function columnEnumType(table, column) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT pg_type.typname AS enum_name
     FROM pg_attribute
     JOIN pg_class ON pg_class.oid = pg_attribute.attrelid
     JOIN pg_type ON pg_type.oid = pg_attribute.atttypid
     WHERE pg_class.relname = $1 AND pg_attribute.attname = $2`,
    table,
    column
  );
  return rows?.[0]?.enum_name || null;
}

async function alterColumnToPrismaEnum(table, column) {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE ${table}
    ALTER COLUMN ${column} TYPE "PaymentProvider"
    USING CASE WHEN ${column} IS NULL THEN NULL ELSE (${column}::text)::"PaymentProvider" END
  `);
}

async function up() {
  try {
    const hasLower = await enumExists('paymentprovider');
    const hasProper = await enumExists('PaymentProvider');

    if (hasLower && !hasProper) {
      // Simple rename when only the lowercase exists
      await prisma.$executeRawUnsafe(`ALTER TYPE paymentprovider RENAME TO "PaymentProvider";`);
      console.log('✅ Renamed enum paymentprovider -> "PaymentProvider"');
    } else if (hasLower && hasProper) {
      // Both exist; ensure columns use "PaymentProvider"
      const prrType = await columnEnumType('payment_routing_rules', 'provider');
      if (prrType === 'paymentprovider') {
        await alterColumnToPrismaEnum('payment_routing_rules', 'provider');
        console.log('✅ Converted payment_routing_rules.provider -> "PaymentProvider"');
      }
      const offType = await columnEnumType('offers', 'preferred_provider');
      if (offType === 'paymentprovider') {
        await alterColumnToPrismaEnum('offers', 'preferred_provider');
        console.log('✅ Converted offers.preferred_provider -> "PaymentProvider"');
      }
    } else if (!hasLower && !hasProper) {
      // Create proper enum if missing (should not happen after previous migration)
      await prisma.$executeRawUnsafe(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentProvider') THEN
            CREATE TYPE "PaymentProvider" AS ENUM ('KRXPAY','STRIPE','ADYEN','PAYPAL','MERCADOPAGO','PAGARME','OPENFINANCE');
          END IF;
        END$$;
      `);
      console.log('ℹ️ Created enum "PaymentProvider"');
    } else {
      console.log('ℹ️ Enum "PaymentProvider" already in place');
    }

    // Ensure both columns use the proper enum now
    const prrNow = await columnEnumType('payment_routing_rules', 'provider');
    if (prrNow !== 'PaymentProvider') {
      await alterColumnToPrismaEnum('payment_routing_rules', 'provider');
      console.log('✅ Ensured payment_routing_rules.provider uses "PaymentProvider"');
    }
    const offNow = await columnEnumType('offers', 'preferred_provider');
    if (offNow !== 'PaymentProvider') {
      await alterColumnToPrismaEnum('offers', 'preferred_provider');
      console.log('✅ Ensured offers.preferred_provider uses "PaymentProvider"');
    }

    console.log('✅ Migration completed: enum type aligned to "PaymentProvider"');
  } catch (e) {
    console.error('❌ Migration failed:', e?.message || e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

up();
