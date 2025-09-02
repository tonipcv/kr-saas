// scripts/run-public-fields-migration.js
// Executa uma migração SQL simples para adicionar campos públicos no User.

require('dotenv').config();
const { Client } = require('pg');

const SQL = `
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    WHERE t.typname = 'PublicPageTemplate'
  ) THEN
    CREATE TYPE "PublicPageTemplate" AS ENUM ('DEFAULT', 'MINIMAL', 'HERO_CENTER', 'HERO_LEFT');
  END IF;
END $$;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS public_cover_image_url text,
  ADD COLUMN IF NOT EXISTS public_page_template "PublicPageTemplate" NOT NULL DEFAULT 'DEFAULT';

COMMIT;
`;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('Missing env: DATABASE_URL');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    console.log('Connected. Running migration...');
    await client.query(SQL);
    console.log('Migration applied: public_cover_image_url + public_page_template');
  } catch (err) {
    console.error('Migration failed:', err?.message || err);
    try {
      await client.query('ROLLBACK;');
    } catch (e) {
      // ignore
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
