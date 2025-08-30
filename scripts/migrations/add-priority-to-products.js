/*
  Direct SQL migration to add `priority` column to products and create an index.
  - Safe to run multiple times (idempotent)
  - Uses Prisma Client to run raw SQL
*/

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Starting migration: add priority to products...');

  // Detect if column already exists (PostgreSQL or SQLite compatible approach)
  // For Postgres, we check information_schema; for SQLite, pragma_table_info
  let hasColumn = false;
  try {
    // Try Postgres information_schema first
    const rows = await prisma.$queryRawUnsafe(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'priority' LIMIT 1;`
    );
    hasColumn = Array.isArray(rows) && rows.length > 0;
  } catch (_) {
    // Fallback to SQLite pragma
    try {
      const pragma = await prisma.$queryRawUnsafe(`PRAGMA table_info(products);`);
      if (Array.isArray(pragma)) {
        hasColumn = pragma.some((r) => (r.name || r.cid || '').toString().toLowerCase() === 'priority');
      }
    } catch (e) {
      console.warn('Could not check existing columns, proceeding optimistically:', e?.message);
    }
  }

  if (hasColumn) {
    console.log('Column `priority` already exists on `products`. Skipping ADD COLUMN.');
  } else {
    console.log('Adding `priority` column to `products`...');
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "products" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0;`
    );
    console.log('Added `priority` column.');
  }

  // Create index to help ordering/filtering by priority
  try {
    console.log('Creating index (if not exists) on products(priority)...');
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS products_priority_idx ON "products" ("priority");`
    );
    console.log('Index ensured: products_priority_idx');
  } catch (e) {
    console.warn('Unable to create index (may be unsupported on this dialect):', e?.message);
  }

  console.log('Migration completed successfully.');
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
