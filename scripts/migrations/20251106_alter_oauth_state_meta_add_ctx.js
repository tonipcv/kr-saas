#!/usr/bin/env node
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  // Add columns if they don't exist
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'oauth_state_meta' AND column_name = 'product_id'
      ) THEN
        ALTER TABLE oauth_state_meta ADD COLUMN product_id TEXT;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'oauth_state_meta' AND column_name = 'amount_cents'
      ) THEN
        ALTER TABLE oauth_state_meta ADD COLUMN amount_cents INTEGER;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'oauth_state_meta' AND column_name = 'currency'
      ) THEN
        ALTER TABLE oauth_state_meta ADD COLUMN currency TEXT;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'oauth_state_meta' AND column_name = 'order_ref'
      ) THEN
        ALTER TABLE oauth_state_meta ADD COLUMN order_ref TEXT;
      END IF;
    END $$;
  `);
  console.log('oauth_state_meta altered: product_id, amount_cents, currency, order_ref ensured.');
}

main().then(async () => {
  await prisma.$disconnect();
}).catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
