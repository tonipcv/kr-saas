/*
  Create payment orchestration tables and columns directly in the database (idempotent)

  - Tables: customers, customer_providers, customer_payment_methods, customer_subscriptions
  - Columns on payment_transactions: customer_id, customer_provider_id, customer_payment_method_id, customer_subscription_id,
    billing_period_start, billing_period_end
  - Indexes and unique constraints

  Usage:
    node scripts/migrations/20251115_add_payment_orchestration_models.js
*/

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function ensureEnum(name, values) {
  const exists = await prisma.$queryRawUnsafe(
    `SELECT 1 FROM pg_type WHERE typname = $1`,
    name
  );
  if (!exists.length) {
    const vs = values.map(v => `'${v}'`).join(',');
    await prisma.$executeRawUnsafe(`CREATE TYPE "${name}" AS ENUM (${vs});`);
    console.log(`ℹ️ Created enum "${name}"`);
  }
}

async function up() {
  try {
    // Ensure enums exist (no-op if already present)
    await ensureEnum('PaymentProvider', ['KRXPAY','STRIPE','ADYEN','PAYPAL','MERCADOPAGO','PAGARME','OPENFINANCE']);
    // Currency/SubscriptionStatus assumed to exist in schema; guard-create with common values if missing
    await ensureEnum('Currency', ['BRL','USD','EUR','MXN']);
    await ensureEnum('SubscriptionStatus', ['TRIAL','ACTIVE','PAST_DUE','CANCELED','INCOMPLETE','INCOMPLETE_EXPIRED']);

    // customers
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS customers (
        id text PRIMARY KEY,
        merchant_id text NOT NULL,
        name text,
        email text,
        phone text,
        document text,
        address jsonb,
        metadata jsonb,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );
    `);

    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_customers_merchant_email ON customers(merchant_id, email);`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_customers_merchant_phone ON customers(merchant_id, phone);`);

    // customer_providers
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS customer_providers (
        id text PRIMARY KEY,
        customer_id text NOT NULL,
        provider "PaymentProvider" NOT NULL,
        account_id text,
        provider_customer_id text NOT NULL,
        metadata jsonb,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );
    `);

    // unique + indexes
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'uq_customer_providers_provider_account_provider_customer'
        ) THEN
          ALTER TABLE customer_providers
          ADD CONSTRAINT uq_customer_providers_provider_account_provider_customer
          UNIQUE (provider, account_id, provider_customer_id);
        END IF;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'uq_customer_providers_customer_provider_account'
        ) THEN
          ALTER TABLE customer_providers
          ADD CONSTRAINT uq_customer_providers_customer_provider_account
          UNIQUE (customer_id, provider, account_id);
        END IF;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_customer_providers_cust_provider_account ON customer_providers(customer_id, provider, account_id);`);

    // customer_payment_methods
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS customer_payment_methods (
        id text PRIMARY KEY,
        customer_id text NOT NULL,
        customer_provider_id text,
        provider "PaymentProvider" NOT NULL,
        account_id text,
        provider_payment_method_id text,
        brand text,
        last4 text,
        exp_month integer,
        exp_year integer,
        is_default boolean NOT NULL DEFAULT false,
        status text,
        fingerprint text,
        metadata jsonb,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_cpm_provider_account_pm') THEN
          CREATE UNIQUE INDEX uq_cpm_provider_account_pm ON customer_payment_methods(provider, account_id, provider_payment_method_id);
        END IF;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_cpm_customer_provider_account ON customer_payment_methods(customer_id, provider, account_id);`);

    // customer_subscriptions
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS customer_subscriptions (
        id text PRIMARY KEY,
        customer_id text NOT NULL,
        merchant_id text NOT NULL,
        product_id text NOT NULL,
        offer_id text,
        provider "PaymentProvider" NOT NULL,
        account_id text,
        is_native boolean NOT NULL DEFAULT true,
        customer_provider_id text,
        provider_subscription_id text,
        vault_payment_method_id text,
        status "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
        start_at timestamp NOT NULL DEFAULT now(),
        trial_ends_at timestamp,
        current_period_start timestamp,
        current_period_end timestamp,
        cancel_at timestamp,
        canceled_at timestamp,
        price_cents integer NOT NULL,
        currency "Currency" NOT NULL,
        metadata jsonb,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );
    `);

    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_csubs_merchant_status ON customer_subscriptions(merchant_id, status);`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_csubs_provider_account_subid ON customer_subscriptions(provider, account_id, provider_subscription_id);`);

    // Add columns to payment_transactions (idempotent)
    await prisma.$executeRawUnsafe(`
      ALTER TABLE payment_transactions
      ADD COLUMN IF NOT EXISTS customer_id text,
      ADD COLUMN IF NOT EXISTS customer_provider_id text,
      ADD COLUMN IF NOT EXISTS customer_payment_method_id text,
      ADD COLUMN IF NOT EXISTS customer_subscription_id text,
      ADD COLUMN IF NOT EXISTS billing_period_start timestamp,
      ADD COLUMN IF NOT EXISTS billing_period_end timestamp;
    `);

    console.log('✅ Migration completed: customers/* tables and payment_transactions columns ensured');
  } catch (e) {
    console.error('❌ Migration failed:', e?.message || e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

up();
