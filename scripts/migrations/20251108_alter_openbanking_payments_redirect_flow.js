#!/usr/bin/env node
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  // Add missing columns for redirect-based payments (safe IF NOT EXISTS operations)
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='openbanking_payments' AND column_name='payment_link_id'
      ) THEN
        ALTER TABLE openbanking_payments ADD COLUMN payment_link_id TEXT;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='openbanking_payments' AND column_name='product_id'
      ) THEN
        ALTER TABLE openbanking_payments ADD COLUMN product_id TEXT;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='openbanking_payments' AND column_name='enrollment_id'
      ) THEN
        ALTER TABLE openbanking_payments ADD COLUMN enrollment_id TEXT;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='openbanking_payments' AND column_name='user_id'
      ) THEN
        ALTER TABLE openbanking_payments ADD COLUMN user_id TEXT;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='openbanking_payments' AND column_name='order_ref'
      ) THEN
        ALTER TABLE openbanking_payments ADD COLUMN order_ref TEXT;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='openbanking_payments' AND column_name='payer_name'
      ) THEN
        ALTER TABLE openbanking_payments ADD COLUMN payer_name TEXT;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='openbanking_payments' AND column_name='payer_email'
      ) THEN
        ALTER TABLE openbanking_payments ADD COLUMN payer_email TEXT;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='openbanking_payments' AND column_name='payer_cpf'
      ) THEN
        ALTER TABLE openbanking_payments ADD COLUMN payer_cpf TEXT;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='openbanking_payments' AND column_name='redirect_uri'
      ) THEN
        ALTER TABLE openbanking_payments ADD COLUMN redirect_uri TEXT;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='openbanking_payments' AND column_name='transaction_id'
      ) THEN
        ALTER TABLE openbanking_payments ADD COLUMN transaction_id TEXT;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='openbanking_payments' AND column_name='completed_at'
      ) THEN
        ALTER TABLE openbanking_payments ADD COLUMN completed_at TIMESTAMPTZ;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='openbanking_payments' AND column_name='expires_at'
      ) THEN
        ALTER TABLE openbanking_payments ADD COLUMN expires_at TIMESTAMPTZ;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='openbanking_payments' AND column_name='metadata'
      ) THEN
        ALTER TABLE openbanking_payments ADD COLUMN metadata JSONB;
      END IF;
    END $$;
  `);

  // Add unique + helpful indexes
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_openbanking_payments_payment_link_id'
      ) THEN
        CREATE UNIQUE INDEX idx_openbanking_payments_payment_link_id ON openbanking_payments(payment_link_id);
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_openbanking_payments_status'
      ) THEN
        CREATE INDEX idx_openbanking_payments_status ON openbanking_payments(status);
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_openbanking_payments_user_id'
      ) THEN
        CREATE INDEX idx_openbanking_payments_user_id ON openbanking_payments(user_id);
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_openbanking_payments_created_at'
      ) THEN
        CREATE INDEX idx_openbanking_payments_created_at ON openbanking_payments(created_at);
      END IF;
    END $$;
  `);

  console.log('openbanking_payments altered for redirect-based flow.');
}

main().then(async () => {
  await prisma.$disconnect();
}).catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
