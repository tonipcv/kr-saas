#!/usr/bin/env node
/*
  Align DB enum types with Prisma expectations by creating public."EventType" and public."EventActor"
  and migrating events table columns to use them.

  Usage:
    node scripts/migrations/20250916_align_event_enums_prisma.js
*/

const { prisma } = require('../../dist/lib/prisma.js');

const EVENT_TYPES = [
  'customer_created','customer_updated','customer_visit','lead_created','lead_converted','review_submitted','feedback_negative',
  'purchase_made','purchase_refund','payment_processed','subscription_billed','subscription_canceled','chargeback_reported',
  'reward_created','reward_offered','reward_viewed','reward_claimed','reward_redeemed','reward_expired','points_earned','points_spent',
  'campaign_sent','campaign_opened','campaign_clicked','campaign_replied','conversation_started','conversation_closed',
  'membership_started','membership_renewed','membership_canceled','membership_upgraded',
  'prediction_made','action_taken','outcome_recorded',
  'user_logged_in','config_changed','integration_added',
  'ai_autoreply_sent'
];

const EVENT_ACTORS = ['customer','clinic','system','ai'];

async function ensurePgEnum(enumName, values) {
  // Create enum if not exists, or add missing values
  const exists = await prisma.$queryRawUnsafe(
    `SELECT 1 FROM pg_type WHERE typname = $1`, enumName.toLowerCase()
  );
  if (!Array.isArray(exists) || exists.length === 0) {
    const quotedValues = values.map(v => `'${v}'`).join(',');
    await prisma.$executeRawUnsafe(`CREATE TYPE "${enumName}" AS ENUM (${quotedValues})`);
    console.log(`[migration] Created enum ${enumName}`);
  } else {
    // Add missing values
    const current = await prisma.$queryRawUnsafe(
      `SELECT enumlabel FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = $1`, enumName.toLowerCase()
    );
    const currentValues = new Set(current.map(r => r.enumlabel));
    for (const v of values) {
      if (!currentValues.has(v)) {
        await prisma.$executeRawUnsafe(`ALTER TYPE "${enumName}" ADD VALUE '${v}'`);
        console.log(`[migration] Added value '${v}' to enum ${enumName}`);
      }
    }
  }
}

async function migrateEventsColumns() {
  // event_type -> "EventType"
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'events' AND column_name = 'event_type'
      ) THEN
        ALTER TABLE events ALTER COLUMN event_type TYPE "EventType" USING event_type::text::"EventType";
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'events' AND column_name = 'actor'
      ) THEN
        ALTER TABLE events ALTER COLUMN actor TYPE "EventActor" USING actor::text::"EventActor";
      END IF;
    END $$;
  `);
  console.log('[migration] Migrated events.event_type and events.actor to Prisma enums');
}

async function main() {
  console.log('[migration] Aligning enums to Prisma');
  await ensurePgEnum('EventType', EVENT_TYPES);
  await ensurePgEnum('EventActor', EVENT_ACTORS);
  await migrateEventsColumns();
  console.log('[migration] Done.');
}

main()
  .catch((e) => { console.error('[migration] Error:', e); process.exit(1); })
  .finally(async () => { try { await prisma.$disconnect(); } catch {} });
