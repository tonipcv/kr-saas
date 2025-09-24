#!/usr/bin/env node
/**
 * Direct SQL fix for message_templates table
 * - Executes raw SQL to modify the column type directly
 */

const { Pool } = require('pg');
require('dotenv').config();

async function run() {
  console.log('[direct-sql] Starting fix for message tables');
  
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL not found in environment');
    process.exit(1);
  }
  
  const pool = new Pool({ connectionString });
  
  try {
    // Check if the table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'message_templates'
      )
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('Table message_templates does not exist');
      return;
    }
    
    // Check column types
    const columnCheck = await pool.query(`
      SELECT column_name, data_type, udt_name 
      FROM information_schema.columns 
      WHERE table_name = 'message_templates' 
      AND column_name = 'channel'
    `);
    
    console.log('Current channel column type:', columnCheck.rows[0]?.data_type);
    
    // Directly alter column types to text/varchar
    console.log('Altering column types...');
    
    // First try to drop any enum dependencies
    try {
      await pool.query(`
        ALTER TABLE message_templates 
        ALTER COLUMN channel TYPE VARCHAR(20) USING channel::text
      `);
      console.log('Successfully altered channel column');
    } catch (e) {
      console.log('Error altering channel column:', e.message);
      
      // More aggressive approach - create a new table and copy data
      console.log('Trying more aggressive approach with CREATE TABLE AS...');
      
      // Backup the table
      await pool.query(`CREATE TABLE message_templates_backup AS SELECT * FROM message_templates`);
      console.log('Created backup table message_templates_backup');
      
      // Drop the original table
      await pool.query(`DROP TABLE message_templates CASCADE`);
      console.log('Dropped original table');
      
      // Create new table with correct column types
      await pool.query(`
        CREATE TABLE message_templates (
          id TEXT PRIMARY KEY,
          "doctorId" TEXT NOT NULL,
          name TEXT NOT NULL,
          channel VARCHAR(20) NOT NULL,
          subject TEXT,
          html TEXT,
          text TEXT,
          mjml TEXT,
          "renderStrategy" VARCHAR(20),
          "fromName" TEXT,
          "fromEmail" TEXT,
          "replyTo" TEXT,
          provider TEXT,
          "waTemplateName" TEXT,
          "waLanguage" TEXT,
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
      console.log('Created new table with correct column types');
      
      // Copy data from backup
      await pool.query(`
        INSERT INTO message_templates
        SELECT id, "doctorId", name, channel::text, subject, html, text, mjml,
               "renderStrategy"::text, "fromName", "fromEmail", "replyTo", provider,
               "waTemplateName", "waLanguage", "waCategory", "waComponents", "waStatus",
               "waProviderId", "isActive", "createdAt", "updatedAt", 
               "variablesSchema", "sampleVariables", tags, "smsMaxSegments"
        FROM message_templates_backup
      `);
      console.log('Copied data from backup');
      
      // Add indexes
      await pool.query(`CREATE INDEX "message_templates_doctorId_idx" ON message_templates("doctorId")`);
      console.log('Added index on doctorId');
      
      // Add unique constraints
      try {
        await pool.query(`
          ALTER TABLE message_templates 
          ADD CONSTRAINT "message_templates_doctorId_name_key" 
          UNIQUE ("doctorId", name)
        `);
        console.log('Added unique constraint on doctorId+name');
      } catch (e) {
        console.log('Error adding unique constraint:', e.message);
      }
      
      try {
        await pool.query(`
          ALTER TABLE message_templates 
          ADD CONSTRAINT "message_templates_doctorId_channel_waTemplateName_waLanguage_key" 
          UNIQUE ("doctorId", channel, "waTemplateName", "waLanguage")
        `);
        console.log('Added unique constraint on doctorId+channel+waTemplateName+waLanguage');
      } catch (e) {
        console.log('Error adding second unique constraint:', e.message);
      }
    }
    
    // Now fix message_sequence_steps if needed
    try {
      await pool.query(`
        ALTER TABLE message_sequence_steps 
        ALTER COLUMN "delayUnit" TYPE VARCHAR(16) USING "delayUnit"::text
      `);
      console.log('Successfully altered delayUnit column');
    } catch (e) {
      console.log('Error altering delayUnit column:', e.message);
    }
    
    // Try to drop the enum types if they exist
    try {
      await pool.query(`DROP TYPE IF EXISTS "MessageChannel"`);
      await pool.query(`DROP TYPE IF EXISTS "TimeUnit"`);
      await pool.query(`DROP TYPE IF EXISTS "RenderStrategy"`);
      console.log('Dropped enum types if they existed');
    } catch (e) {
      console.log('Error dropping enum types:', e.message);
    }
    
    console.log('[direct-sql] Fix completed');
  } catch (err) {
    console.error('[direct-sql] Error:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
