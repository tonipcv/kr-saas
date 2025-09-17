#!/usr/bin/env node
/*
  Creates whatsapp_messages table to store sends and delivery/read statuses for metrics.
  Usage:
    node scripts/migrations/20250915_create_whatsapp_messages.js
*/

const { prisma } = require('../../dist/lib/prisma.js');

async function main() {
  console.log('[migration] Starting: create whatsapp_messages');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
      clinic_id TEXT NOT NULL,
      waba_id TEXT,
      phone_number_id TEXT,
      template_name TEXT,
      message_id TEXT,
      direction TEXT NOT NULL DEFAULT 'OUT', -- OUT | IN
      recipient TEXT, -- E.164
      sender TEXT,
      status TEXT, -- SENT | DELIVERED | READ | FAILED
      status_reason TEXT,
      sent_at TIMESTAMPTZ DEFAULT now(),
      delivered_at TIMESTAMPTZ,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_clinic ON whatsapp_messages (clinic_id);`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_template ON whatsapp_messages (template_name);`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_messageid ON whatsapp_messages (message_id);`);
  console.log('[migration] Done.');
}

main()
  .catch((e) => { console.error('[migration] Error:', e); process.exit(1); })
  .finally(async () => { try { await prisma.$disconnect(); } catch {} });
