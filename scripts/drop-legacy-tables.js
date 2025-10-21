#!/usr/bin/env node
/*
  Drops legacy tables, constraints, columns, and enum types that were removed from prisma/schema.prisma.
  This script is idempotent and safe to re-run.
*/
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

async function main() {
  // Run sequentially to ensure order, using DO blocks for idempotency
  // 1) Drop columns/constraints that reference removed entities
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      -- referrals.protocol_id (if exists)
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'referrals' AND column_name = 'protocol_id'
      ) THEN
        BEGIN
          ALTER TABLE referrals DROP CONSTRAINT IF EXISTS referrals_protocol_id_fkey;
        EXCEPTION WHEN undefined_object THEN
        END;
        ALTER TABLE referrals DROP COLUMN IF EXISTS protocol_id;
      END IF;
    END $$;
  `);

  // 2) Drop tables (order matters due to FKs)
  const dropTables = [
    // Protocol ecosystem
    'protocol_task_progress',
    'protocol_contents',
    'protocol_tasks',
    'protocol_sessions',
    'protocol_days',
    'protocol_prescriptions',
    'protocol_products',
    'protocol_courses',
    'protocol_faqs',
    'doctor_default_protocols',
    'protocols',

    // Courses
    'user_lessons',
    'user_courses',
    'lessons',
    'modules',
    'courses',

    // Daily check-in, symptoms
    'symptom_report_attachments',
    'symptom_reports',
    'daily_checkin_responses',
    'daily_checkin_questions',

    // Onboarding
    'onboarding_answers',
    'onboarding_responses',
    'onboarding_steps',
    'onboarding_templates',

    // Voice notes
    'voice_note_checklists',
    'voice_notes',

    // Habit tracking
    'habit_progress',
    'habits',

    // Membership (per clinic)
    'membership_levels',
    'membership_level_templates',

    // Patient documents
    'patient_document_metadata',
    'patient_documents',

    // Consultation forms
    'consultation_submissions',
    'consultation_forms',

    // AI messaging/FAQ
    'patient_ai_messages',
    'patient_ai_conversations',
    'doctor_faqs',
    'ai_assistant_settings',

    // System metrics and referrals to external clinics
    'system_metrics',
    'clinic_referrals',

    // Doctor/patient relationships
    'doctor_patient_relationships',

    // Calendar/appointments/services
    'google_calendar_credentials',
    'appointments',
    'doctor_services',

    // Misc migrations
    'subscription_migration_logs',
  ];

  for (const table of dropTables) {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${table} CASCADE;`);
  }

  // 3) Drop enum types if they exist
  const dropTypes = [
    'public_page_template',
    'prescription_status',
    'day_status',
    'dailycheckinquestiontype',
    'symptomreportstatus',
    'voicenotestatus',
    'appointmentstatus',
    'serviceavailability',
    'feetype',
    'feevisibility',
  ];

  for (const typeName of dropTypes) {
    await prisma.$executeRawUnsafe(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_type WHERE typname = '${typeName}') THEN
        EXECUTE 'DROP TYPE ${typeName} CASCADE';
      END IF;
    END $$;`);
  }
}

main()
  .then(async () => {
    console.log('Legacy tables/columns/types dropped successfully');
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('Error dropping legacy entities:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
