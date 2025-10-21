#!/usr/bin/env node
/**
 * Convert User.public_page_template from Postgres enum to TEXT with default 'DEFAULT'.
 * Idempotent and safe to re-run.
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

async function main() {
  // 1) If column exists and is enum, convert to TEXT
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'User' AND column_name = 'public_page_template'
      ) THEN
        -- Detect if the column is an enum by checking pg_type
        PERFORM 1 FROM pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_class c ON a.attrelid = c.oid
        JOIN pg_catalog.pg_type t ON a.atttypid = t.oid
        WHERE c.relname = 'User' AND a.attname = 'public_page_template' AND t.typcategory = 'E';

        IF FOUND THEN
          -- Drop default temporarily to allow type change
          BEGIN
            ALTER TABLE "User" ALTER COLUMN public_page_template DROP DEFAULT;
          EXCEPTION WHEN undefined_column THEN
          END;

          -- Convert enum -> text
          ALTER TABLE "User" 
            ALTER COLUMN public_page_template TYPE text 
            USING public_page_template::text;

          -- Reinstate default as text
          ALTER TABLE "User" ALTER COLUMN public_page_template SET DEFAULT 'DEFAULT';
        ELSE
          -- Ensure default is set even if already text
          BEGIN
            ALTER TABLE "User" ALTER COLUMN public_page_template SET DEFAULT 'DEFAULT';
          EXCEPTION WHEN undefined_column THEN
          END;
        END IF;
      END IF;
    END $$;
  `);

  // 2) Drop the old enum type if it still exists
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'public_page_template') THEN
        EXECUTE 'DROP TYPE public_page_template CASCADE';
      END IF;
    END $$;
  `);
}

main()
  .then(async () => {
    console.log('Migration completed: public_page_template is TEXT with default.');
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('Migration failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
