#!/usr/bin/env node
/*
  Cria/ajusta enums e tabela events para usar tipos enum (idempotente).
  Uso:
    node scripts/migrations/20250915_create_event_enums.js
*/

const { prisma } = require('../../dist/lib/prisma.js');

const STATEMENTS = [
  // Enums
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_type_enum') THEN
       CREATE TYPE event_type_enum AS ENUM (
         'customer_created','customer_updated','customer_visit','lead_created','lead_converted','review_submitted','feedback_negative',
         'purchase_made','purchase_refund','payment_processed','subscription_billed','subscription_canceled','chargeback_reported',
         'reward_created','reward_offered','reward_viewed','reward_claimed','reward_redeemed','reward_expired','points_earned','points_spent',
         'campaign_sent','campaign_opened','campaign_clicked','campaign_replied','conversation_started','conversation_closed',
         'membership_started','membership_renewed','membership_canceled','membership_upgraded',
         'prediction_made','action_taken','outcome_recorded',
         'user_logged_in','config_changed','integration_added'
       );
     END IF;
     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_actor_enum') THEN
       CREATE TYPE event_actor_enum AS ENUM ('customer','clinic','system','ai');
     END IF;
   END $$;`,
  // Create table if missing
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM information_schema.tables WHERE table_name = 'events'
     ) THEN
       CREATE TABLE events (
         id TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
         event_id TEXT UNIQUE,
         event_type event_type_enum NOT NULL,
         customer_id TEXT,
         clinic_id TEXT NOT NULL,
         actor event_actor_enum NOT NULL,
         timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
         metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now()
       );
     END IF;
   END $$;`,
  // Alter columns to enum if table exists with text columns
  `DO $$
   BEGIN
     IF EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name = 'events' AND column_name = 'event_type' AND udt_name <> 'event_type_enum'
     ) THEN
       ALTER TABLE events ALTER COLUMN event_type TYPE event_type_enum USING event_type::event_type_enum;
     END IF;
     IF EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name = 'events' AND column_name = 'actor' AND udt_name <> 'event_actor_enum'
     ) THEN
       ALTER TABLE events ALTER COLUMN actor TYPE event_actor_enum USING actor::event_actor_enum;
     END IF;
     IF EXISTS (
       SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'timestamp'
     ) THEN
       ALTER TABLE events ALTER COLUMN "timestamp" SET DEFAULT now();
     END IF;
     IF EXISTS (
       SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'metadata'
     ) THEN
       ALTER TABLE events ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;
     END IF;
   END $$;`,
  // Indexes
  'CREATE INDEX IF NOT EXISTS idx_events_clinic_ts ON events (clinic_id, "timestamp" DESC);',
  'CREATE INDEX IF NOT EXISTS idx_events_type_ts ON events (event_type, "timestamp" DESC);',
  'CREATE INDEX IF NOT EXISTS idx_events_customer_ts ON events (customer_id, "timestamp" DESC);',
  'CREATE INDEX IF NOT EXISTS idx_events_metadata_gin ON events USING GIN (metadata);',
];

async function main() {
  console.log('[migration] Starting: create/alter event enums and events table');
  for (const sql of STATEMENTS) {
    await prisma.$executeRawUnsafe(sql);
  }
  console.log('[migration] Done.');
}

main()
  .catch((e) => { console.error('[migration] Error:', e); process.exit(1); })
  .finally(async () => { try { await prisma.$disconnect(); } catch {} });
