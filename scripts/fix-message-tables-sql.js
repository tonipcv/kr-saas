#!/usr/bin/env node
/**
 * Direct SQL migration to fix message_templates table structure
 * - Recreates the table with correct column types
 * - Preserves existing data
 */

const { prisma } = require('../dist/lib/prisma');

async function run() {
  console.log('[migration] fix message tables SQL - start');
  try {
    // Check if the table exists
    const tableExists = await prisma.$queryRawUnsafe(`
      SELECT 1 FROM information_schema.tables WHERE table_name = 'message_templates' LIMIT 1
    `);
    
    if (!tableExists.length) {
      console.log('[migration] message_templates table does not exist, nothing to do');
      return;
    }

    // Create a backup of the table
    console.log('[migration] creating backup of message_templates');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS message_templates_backup AS SELECT * FROM message_templates
    `);

    // Drop the table and recreate with correct column types
    console.log('[migration] dropping and recreating message_templates with correct types');
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS message_templates CASCADE`);
    
    // Create the table with all columns as VARCHAR/TEXT instead of ENUMs
    await prisma.$executeRawUnsafe(`
      CREATE TABLE message_templates (
        id TEXT PRIMARY KEY,
        "doctorId" TEXT NOT NULL,
        name TEXT NOT NULL,
        channel VARCHAR(20) NOT NULL,
        subject TEXT,
        html TEXT,
        text TEXT,
        mjml TEXT,
        "renderStrategy" VARCHAR(20) DEFAULT 'raw_html',
        "fromName" TEXT,
        "fromEmail" TEXT,
        "replyTo" TEXT,
        provider TEXT,
        "waTemplateName" TEXT,
        "waLanguage" VARCHAR(10) DEFAULT 'pt_BR',
        "waCategory" TEXT,
        "waComponents" JSONB,
        "waStatus" TEXT,
        "waProviderId" TEXT,
        "isActive" BOOLEAN DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "variablesSchema" JSONB,
        "sampleVariables" JSONB,
        tags TEXT[] DEFAULT '{}',
        "smsMaxSegments" INTEGER
      )
    `);

    // Restore data from backup
    console.log('[migration] restoring data from backup');
    await prisma.$executeRawUnsafe(`
      INSERT INTO message_templates
      SELECT * FROM message_templates_backup
    `);

    // Add indexes and constraints
    console.log('[migration] adding indexes and constraints');
    await prisma.$executeRawUnsafe(`CREATE INDEX "message_templates_doctorId_idx" ON message_templates("doctorId")`);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE message_templates 
      ADD CONSTRAINT "message_templates_doctorId_name_key" 
      UNIQUE ("doctorId", name)
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE message_templates 
      ADD CONSTRAINT "message_templates_doctorId_channel_waTemplateName_waLanguage_key" 
      UNIQUE ("doctorId", channel, "waTemplateName", "waLanguage")
    `);

    // Do the same for message_sequence_steps
    console.log('[migration] fixing message_sequence_steps');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS message_sequence_steps_backup AS SELECT * FROM message_sequence_steps
    `);
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS message_sequence_steps CASCADE`);
    
    await prisma.$executeRawUnsafe(`
      CREATE TABLE message_sequence_steps (
        id TEXT PRIMARY KEY,
        "sequenceId" TEXT NOT NULL,
        "orderIndex" INTEGER NOT NULL DEFAULT 0,
        "delayAmount" INTEGER NOT NULL DEFAULT 0,
        "delayUnit" VARCHAR(16) NOT NULL DEFAULT 'hours',
        "templateId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Restore data
    await prisma.$executeRawUnsafe(`
      INSERT INTO message_sequence_steps
      SELECT * FROM message_sequence_steps_backup
    `);

    // Add indexes and constraints
    await prisma.$executeRawUnsafe(`CREATE INDEX "message_sequence_steps_sequenceId_idx" ON message_sequence_steps("sequenceId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX "message_sequence_steps_templateId_idx" ON message_sequence_steps("templateId")`);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE message_sequence_steps 
      ADD CONSTRAINT "message_sequence_steps_sequenceId_orderIndex_key" 
      UNIQUE ("sequenceId", "orderIndex")
    `);

    // Add foreign key constraints
    await prisma.$executeRawUnsafe(`
      ALTER TABLE message_sequence_steps
      ADD CONSTRAINT "message_sequence_steps_sequenceId_fkey"
      FOREIGN KEY ("sequenceId") REFERENCES message_sequences(id) ON DELETE CASCADE ON UPDATE CASCADE
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE message_sequence_steps
      ADD CONSTRAINT "message_sequence_steps_templateId_fkey"
      FOREIGN KEY ("templateId") REFERENCES message_templates(id) ON DELETE RESTRICT ON UPDATE CASCADE
    `);

    console.log('[migration] fix message tables SQL - done');
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
