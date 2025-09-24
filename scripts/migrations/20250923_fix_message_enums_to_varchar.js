#!/usr/bin/env node
/**
 * Migration: Convert message_* enum columns to VARCHAR to match Prisma String mapping
 * - message_templates.channel -> VARCHAR(20)
 * - message_templates.render_strategy -> VARCHAR(20)
 * - message_sequence_steps.delay_unit -> VARCHAR(16)
 *
 * Idempotent: checks column exists before altering.
 */

const { prisma } = require('../../dist/lib/prisma');

async function columnExists(table, col) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 LIMIT 1`,
    table, col
  );
  return !!(rows && rows.length);
}

async function alterColumnToVarchar(table, col, len) {
  const exists = await columnExists(table, col);
  if (!exists) return false;
  // Try to alter type; if already varchar, it will no-op or throw harmlessly which we catch
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE ${table} ALTER COLUMN "${col}" TYPE VARCHAR(${len}) USING "${col}"::text`);
    return true;
  } catch (e) {
    // ignore if already correct
    if (!String(e.message || '').includes('cannot cast')) {
      console.warn(`[migration] warn altering ${table}.${col}:`, e.message || e);
    }
    return false;
  }
}

async function dropTypeIfExists(typeName) {
  try {
    await prisma.$executeRawUnsafe(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_type WHERE typname = '${typeName}') THEN EXECUTE 'DROP TYPE IF EXISTS "${typeName}"'; END IF; END $$;`);
  } catch (e) {
    console.warn(`[migration] warn dropping type ${typeName}:`, e.message || e);
  }
}

async function run() {
  console.log('[migration] fix message enums to varchar - start');
  try {
    await alterColumnToVarchar('message_templates', 'channel', 20);
    await alterColumnToVarchar('message_templates', 'render_strategy', 20);
    await alterColumnToVarchar('message_sequence_steps', 'delay_unit', 16);

    // Attempt to drop legacy enum types if they exist and are unused
    await dropTypeIfExists('MessageChannel');
    await dropTypeIfExists('TimeUnit');
    await dropTypeIfExists('RenderStrategy');

    console.log('[migration] fix message enums to varchar - done');
  } catch (err) {
    console.error('[migration] error:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  run();
}
