#!/usr/bin/env node
/*
  Creates the campaign_jobs table for broadcast jobs (idempotent).
  Usage: node scripts/migrations/20250922_create_campaign_jobs.js
*/

const { prisma } = require('../../dist/lib/prisma.js');

async function main() {
  console.log('[migration] Starting: create campaign_jobs');

  // Table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS campaign_jobs (
      id TEXT PRIMARY KEY,
      doctor_id TEXT NOT NULL,
      campaign_id TEXT NOT NULL,
      channel TEXT NOT NULL CHECK (channel in ('whatsapp','sms','email')),
      trigger TEXT NULL,
      schedule_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status TEXT NOT NULL CHECK (status in ('scheduled','running','done','failed','cancelled')),
      last_error TEXT NULL
    );
  `);

  // Indexes
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_campaign_jobs_doctor_id ON campaign_jobs(doctor_id);`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_campaign_jobs_schedule_at ON campaign_jobs(schedule_at);`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_campaign_jobs_status ON campaign_jobs(status);`);

  console.log('[migration] Done.');
}

main()
  .catch((e) => { console.error('[migration] Error:', e); process.exit(1); })
  .finally(async () => { try { await prisma.$disconnect(); } catch {} });
