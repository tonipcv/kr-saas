/*
  Create table product_integrations to store external product IDs per gateway (Stripe, KRXPay, etc.)

  Usage:
    node scripts/migrations/20251112_add_product_integrations.js
*/

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function tableExists(table) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    table
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function enumExists(name) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT 1 FROM pg_type WHERE typname = $1`,
    name
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function run() {
  try {
    const hasEnum = await enumExists('PaymentProvider');
    if (!hasEnum) {
      await prisma.$executeRawUnsafe(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentProvider') THEN
            CREATE TYPE "PaymentProvider" AS ENUM ('KRXPAY','STRIPE','ADYEN');
          END IF;
        END$$;
      `);
      console.log('ℹ️ Ensured enum "PaymentProvider" exists');
    }

    const exists = await tableExists('product_integrations');
    if (!exists) {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS public.product_integrations (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
          product_id TEXT NOT NULL,
          provider "PaymentProvider" NOT NULL,
          external_product_id TEXT NOT NULL,
          metadata JSONB NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      console.log('✅ Created table product_integrations');

      // FK to products
      await prisma.$executeRawUnsafe(`
        ALTER TABLE public.product_integrations
        ADD CONSTRAINT product_integrations_product_id_fkey
        FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
      `);
      console.log('✅ Added FK product_integrations.product_id -> products.id');

      // Unique index (product_id, provider)
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX product_integrations_product_provider_uidx
        ON public.product_integrations (product_id, provider);
      `);
      console.log('✅ Created unique index on (product_id, provider)');

      // Provider index
      await prisma.$executeRawUnsafe(`
        CREATE INDEX product_integrations_provider_idx
        ON public.product_integrations (provider);
      `);
      console.log('✅ Created index on provider');
    } else {
      console.log('ℹ️ Table product_integrations already exists');
    }

    // Ensure function to auto-update updated_at (optional)
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION set_updated_at_product_integrations()
      RETURNS TRIGGER AS $func$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $func$ LANGUAGE plpgsql;
    `);
    // Ensure trigger if it does not exist (use distinct dollar-quoting)
    await prisma.$executeRawUnsafe(`
      DO $mig$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger WHERE tgname = 'trg_set_updated_at_product_integrations'
        ) THEN
          CREATE TRIGGER trg_set_updated_at_product_integrations
          BEFORE UPDATE ON public.product_integrations
          FOR EACH ROW EXECUTE PROCEDURE set_updated_at_product_integrations();
        END IF;
      END
      $mig$;
    `);
    console.log('✅ Ensured updated_at trigger on product_integrations');

    console.log('🎉 Migration completed: product_integrations ready');
  } catch (e) {
    console.error('❌ Migration failed:', e?.message || e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

run();
