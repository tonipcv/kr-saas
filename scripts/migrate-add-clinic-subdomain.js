#!/usr/bin/env node
/*
  Migration: add clinics.subdomain (varchar(255) UNIQUE), backfill from slug when safe, and ensure unique index/constraint exists.
  Usage:
    node scripts/migrate-add-clinic-subdomain.js
*/

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function columnExists(schema, table, column) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3 LIMIT 1`,
    schema, table, column
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function indexExists(schema, table, indexName) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT 1 FROM pg_indexes WHERE schemaname = $1 AND tablename = $2 AND indexname = $3 LIMIT 1`,
    schema, table, indexName
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function constraintExists(table, constraintName) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT 1 FROM information_schema.table_constraints WHERE table_name = $1 AND constraint_name = $2 LIMIT 1`,
    table, constraintName
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function main() {
  console.log('--- Migration: add clinics.subdomain ---');
  const schema = 'public';
  const table = 'clinics';
  const column = 'subdomain';
  const uniqueIdx = 'clinics_subdomain_unique_idx';
  const uniqueConstraint = 'clinics_subdomain_key'; // prisma-style name

  try {
    const hasColumn = await columnExists(schema, table, column);
    if (!hasColumn) {
      console.log('Adding column clinics.subdomain (varchar(255))...');
      await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "${column}" VARCHAR(255)`);
    } else {
      console.log('Column clinics.subdomain already exists.');
    }

    // Backfill from slug when safe (no collisions)
    console.log('Backfilling subdomain from slug when safe...');
    await prisma.$executeRawUnsafe(`
      UPDATE "${table}" c
      SET "${column}" = c.slug
      WHERE c."${column}" IS NULL
        AND c.slug IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "${table}" x WHERE x."${column}" = c.slug
        )
    `);

    // Ensure unique constraint or unique index
    const hasConstraint = await constraintExists(table, uniqueConstraint);
    if (!hasConstraint) {
      // Try to add unique constraint (allows multiple NULLs in Postgres)
      console.log('Adding UNIQUE constraint on clinics.subdomain...');
      try {
        await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD CONSTRAINT ${uniqueConstraint} UNIQUE ("${column}")`);
      } catch (e) {
        console.warn('Failed to add UNIQUE constraint (will try unique index):', e?.message || e);
        const hasIdx = await indexExists(schema, table, uniqueIdx);
        if (!hasIdx) {
          console.log('Creating UNIQUE index on clinics.subdomain...');
          await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX ${uniqueIdx} ON "${table}" ("${column}")`);
        } else {
          console.log('Unique index already exists.');
        }
      }
    } else {
      console.log('Unique constraint already exists.');
    }

    console.log('Migration completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
