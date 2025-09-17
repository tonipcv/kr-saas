#!/usr/bin/env node
/*
  Adds 'ai_autoreply_sent' to event_type_enum if missing.
  Usage:
    node scripts/migrations/20250916_add_ai_autoreply_event.js
*/

const { prisma } = require('../../dist/lib/prisma.js');

async function main() {
  console.log('[migration] Starting: add ai_autoreply_sent to event_type_enum');

  // Check if enum value exists
  const checkSql = `SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'event_type_enum' AND e.enumlabel = 'ai_autoreply_sent'`;
  const exists = await prisma.$queryRawUnsafe(checkSql);
  if (Array.isArray(exists) && exists.length > 0) {
    console.log('[migration] Enum value already exists. Skipping.');
  } else {
    // Add value at the end
    await prisma.$executeRawUnsafe(`ALTER TYPE event_type_enum ADD VALUE 'ai_autoreply_sent'`);
    console.log('[migration] Added enum value: ai_autoreply_sent');
  }

  console.log('[migration] Done.');
}

main()
  .catch((e) => { console.error('[migration] Error:', e); process.exit(1); })
  .finally(async () => { try { await prisma.$disconnect(); } catch {} });
