#!/usr/bin/env node
/**
 * Migration: Create message templates and sequences tables
 * - message_templates
 * - message_sequences
 * - message_sequence_steps
 *
 * Idempotent: safe to run multiple times.
 */

const { prisma } = require('../../dist/lib/prisma');

async function run() {
  console.log('[migration] create message templates & sequences - start');
  try {
    // Ensure pgcrypto for gen_random_uuid if needed (some DBs require it)
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

    // Create message_templates
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'message_templates'
        ) THEN
          CREATE TABLE message_templates (
            id               TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
            doctor_id        TEXT NOT NULL,
            name             TEXT NOT NULL,
            channel          TEXT NOT NULL CHECK (channel IN ('email','whatsapp','sms')),
            -- Email fields
            subject          TEXT,
            html             TEXT,
            text             TEXT,
            -- MJML + render strategy
            mjml             TEXT,
            render_strategy  TEXT NOT NULL DEFAULT 'raw_html' CHECK (render_strategy IN ('raw_html','mjml')),
            -- Sender overrides
            from_name        TEXT,
            from_email       TEXT,
            reply_to         TEXT,
            -- WhatsApp template
            provider         TEXT,
            wa_template_name TEXT,
            wa_language      TEXT DEFAULT 'pt_BR',
            wa_category      TEXT,
            wa_components    JSONB,
            wa_status        TEXT,
            wa_provider_id   TEXT,
            -- Variables & metadata
            variables_schema JSONB,
            sample_variables JSONB,
            tags             TEXT[] DEFAULT '{}',
            sms_max_segments INTEGER,
            is_active        BOOLEAN NOT NULL DEFAULT TRUE,
            created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX idx_message_templates_doctor ON message_templates(doctor_id);
          CREATE UNIQUE INDEX uniq_message_templates_doctor_name ON message_templates(doctor_id, name);
          -- For WA template uniqueness (allows NULLs)
          CREATE UNIQUE INDEX uniq_message_templates_wa ON message_templates(doctor_id, channel, wa_template_name, wa_language);
        END IF;
      END $$;
    `);

    // Create message_sequences
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'message_sequences'
        ) THEN
          CREATE TABLE message_sequences (
            id          TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
            doctor_id   TEXT NOT NULL,
            name        TEXT NOT NULL,
            description TEXT,
            is_active   BOOLEAN NOT NULL DEFAULT TRUE,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX idx_message_sequences_doctor ON message_sequences(doctor_id);
          CREATE UNIQUE INDEX uniq_message_sequences_doctor_name ON message_sequences(doctor_id, name);
        END IF;
      END $$;
    `);

    // Create message_sequence_steps
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'message_sequence_steps'
        ) THEN
          CREATE TABLE message_sequence_steps (
            id           TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
            sequence_id  TEXT NOT NULL,
            order_index  INTEGER NOT NULL DEFAULT 0,
            delay_amount INTEGER NOT NULL DEFAULT 0,
            delay_unit   TEXT NOT NULL DEFAULT 'hours' CHECK (delay_unit IN ('minutes','hours','days')),
            template_id  TEXT NOT NULL,
            created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT fk_steps_sequence FOREIGN KEY (sequence_id) REFERENCES message_sequences(id) ON DELETE CASCADE,
            CONSTRAINT fk_steps_template FOREIGN KEY (template_id) REFERENCES message_templates(id) ON DELETE RESTRICT
          );
          CREATE INDEX idx_steps_sequence ON message_sequence_steps(sequence_id);
          CREATE INDEX idx_steps_template ON message_sequence_steps(template_id);
          CREATE UNIQUE INDEX uniq_steps_sequence_order ON message_sequence_steps(sequence_id, order_index);
        END IF;
      END $$;
    `);

    console.log('[migration] create message templates & sequences - done');
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
