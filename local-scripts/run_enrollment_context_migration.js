#!/usr/bin/env node
/*
Enhance enrollment_contexts for JSR-puro using Prisma Client.
Adds:
- status TEXT
- device_registered BOOLEAN DEFAULT FALSE
- expires_at TIMESTAMPTZ NULL
- updated_at TIMESTAMPTZ DEFAULT now()
- Unique index on (user_id, organisation_id) for non-null user_id rows

Safe & idempotent. Requires DATABASE_URL.

Usage:
  node local-scripts/run_enrollment_context_migration.js
*/
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const stmts = [
    // Ensure table exists (for fresh dev DBs)
    `CREATE TABLE IF NOT EXISTS enrollment_contexts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NULL,
      session_id TEXT NULL,
      enrollment_id TEXT NOT NULL,
      organisation_id TEXT NOT NULL,
      authorisation_server_id TEXT NOT NULL,
      fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    // Add columns if missing
    `DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='enrollment_contexts' AND column_name='status'
      ) THEN
        ALTER TABLE enrollment_contexts ADD COLUMN status TEXT NULL;
      END IF;
    END $$;`,
    `DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='enrollment_contexts' AND column_name='device_registered'
      ) THEN
        ALTER TABLE enrollment_contexts ADD COLUMN device_registered BOOLEAN NOT NULL DEFAULT FALSE;
      END IF;
    END $$;`,
    `DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='enrollment_contexts' AND column_name='expires_at'
      ) THEN
        ALTER TABLE enrollment_contexts ADD COLUMN expires_at TIMESTAMPTZ NULL;
      END IF;
    END $$;`,
    `DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='enrollment_contexts' AND column_name='updated_at'
      ) THEN
        ALTER TABLE enrollment_contexts ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
      END IF;
    END $$;`,
    // Backfill updated_at just in case
    `UPDATE enrollment_contexts SET updated_at = COALESCE(updated_at, created_at)`,
    // Existing indexes
    `CREATE INDEX IF NOT EXISTS idx_enrollment_contexts_user_created ON enrollment_contexts (user_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_enrollment_contexts_session_created ON enrollment_contexts (session_id, created_at)`,
    // Partial unique index to enforce one enrollment per (user, organisation) for rows with user_id
    `DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE schemaname = ANY (current_schemas(false)) AND indexname = 'ux_enrollment_user_org_nonnull'
      ) THEN
        CREATE UNIQUE INDEX ux_enrollment_user_org_nonnull
          ON enrollment_contexts (user_id, organisation_id)
          WHERE user_id IS NOT NULL;
      END IF;
    END $$;`
  ];

  try {
    console.log('[migration] Enhancing enrollment_contexts...');
    for (const sql of stmts) {
      await prisma.$executeRawUnsafe(sql);
    }
    console.log('[migration] Migration applied successfully.');
  } catch (e) {
    console.error('[migration] Failed:', e?.message || e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
