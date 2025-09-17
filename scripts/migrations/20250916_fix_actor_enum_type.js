#!/usr/bin/env node
/*
  Set events.actor back to event_actor_enum to match current Prisma client bindings,
  while keeping events.event_type as "EventType".
*/

const { prisma } = require('../../dist/lib/prisma.js');

async function main() {
  console.log('[migration] Adjusting events.actor to event_actor_enum');
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'events' AND column_name = 'actor'
      ) THEN
        ALTER TABLE events ALTER COLUMN actor TYPE event_actor_enum USING actor::text::event_actor_enum;
      END IF;
    END $$;
  `);
  console.log('[migration] Done.');
}

main()
  .catch((e) => { console.error('[migration] Error:', e); process.exit(1); })
  .finally(async () => { try { await prisma.$disconnect(); } catch {} });
