/*
  Ensures webhook_events table and indexes exist (idempotent).
  Usage: node scripts/ensure_webhook_events.js
*/

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function ensure() {
  // Enable gen_random_uuid()
  try {
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  } catch {}

  // Create table if not exists (aligned with prisma model at bottom of schema)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public.webhook_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      provider text NOT NULL,
      hook_id text NOT NULL,
      type text NOT NULL,
      resource_order_id text NULL,
      resource_charge_id text NULL,
      status text NULL,
      received_at timestamptz NOT NULL DEFAULT now(),
      processed_at timestamptz NULL,
      attempts integer NULL,
      raw jsonb NOT NULL,
      provider_event_id text NULL,
      processed boolean NOT NULL DEFAULT false,
      processing_error text NULL,
      retry_count integer NOT NULL DEFAULT 0,
      max_retries integer NOT NULL DEFAULT 3,
      next_retry_at timestamptz NULL,
      last_retry_at timestamptz NULL,
      error_type text NULL,
      is_retryable boolean NOT NULL DEFAULT true,
      moved_dead_letter boolean NOT NULL DEFAULT false,
      dead_letter_reason text NULL
    );
  `);

  // Unique constraints / indexes (use IF NOT EXISTS)
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'webhook_events_provider_hook_id_key'
      ) THEN
        CREATE UNIQUE INDEX webhook_events_provider_hook_id_key ON public.webhook_events(provider, hook_id);
      END IF;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'webhook_events_provider_event_unique'
      ) THEN
        CREATE UNIQUE INDEX webhook_events_provider_event_unique ON public.webhook_events(provider, provider_event_id);
      END IF;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON public.webhook_events(type)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_webhook_events_order ON public.webhook_events(resource_order_id)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_webhook_events_charge ON public.webhook_events(resource_charge_id)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_webhook_events_received ON public.webhook_events(received_at)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_webhook_events_processing ON public.webhook_events(provider, type, processed)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_webhook_events_unprocessed ON public.webhook_events(processed, received_at)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_webhook_events_next_retry ON public.webhook_events(next_retry_at)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_webhook_events_processed_next_retry ON public.webhook_events(processed, next_retry_at)`);
}

async function main() {
  try {
    console.log('[ensure_webhook_events] starting');
    await ensure();
    console.log('[ensure_webhook_events] done');
  } catch (e) {
    console.error('[ensure_webhook_events] failed:', e?.message || e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
