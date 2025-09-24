#!/usr/bin/env node
/**
 * Migration: Align message_* tables columns to Prisma camelCase field names
 * This will RENAME snake_case columns to camelCase expected by Prisma models.
 * Idempotent: checks column existence before renaming.
 */

const { prisma } = require('../../dist/lib/prisma');

async function renameColumnIfExists(table, from, to) {
  const existsFrom = await prisma.$queryRawUnsafe(
    `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 LIMIT 1`,
    table, from
  );
  const existsTo = await prisma.$queryRawUnsafe(
    `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 LIMIT 1`,
    table, to
  );
  if (existsFrom?.length && !existsTo?.length) {
    await prisma.$executeRawUnsafe(`ALTER TABLE ${table} RENAME COLUMN ${from} TO "${to}"`);
    return true;
  }
  return false;
}

async function run() {
  console.log('[migration] alter message tables to camelCase - start');
  try {
    // message_templates
    await renameColumnIfExists('message_templates', 'is_active', 'isActive');
    await renameColumnIfExists('message_templates', 'doctor_id', 'doctorId');
    await renameColumnIfExists('message_templates', 'created_at', 'createdAt');
    await renameColumnIfExists('message_templates', 'updated_at', 'updatedAt');
    await renameColumnIfExists('message_templates', 'render_strategy', 'renderStrategy');
    await renameColumnIfExists('message_templates', 'from_name', 'fromName');
    await renameColumnIfExists('message_templates', 'from_email', 'fromEmail');
    await renameColumnIfExists('message_templates', 'reply_to', 'replyTo');
    await renameColumnIfExists('message_templates', 'wa_template_name', 'waTemplateName');
    await renameColumnIfExists('message_templates', 'wa_language', 'waLanguage');
    await renameColumnIfExists('message_templates', 'wa_category', 'waCategory');
    await renameColumnIfExists('message_templates', 'wa_components', 'waComponents');
    await renameColumnIfExists('message_templates', 'wa_status', 'waStatus');
    await renameColumnIfExists('message_templates', 'wa_provider_id', 'waProviderId');
    await renameColumnIfExists('message_templates', 'variables_schema', 'variablesSchema');
    await renameColumnIfExists('message_templates', 'sample_variables', 'sampleVariables');
    await renameColumnIfExists('message_templates', 'sms_max_segments', 'smsMaxSegments');
    // message_sequences
    await renameColumnIfExists('message_sequences', 'doctor_id', 'doctorId');
    await renameColumnIfExists('message_sequences', 'is_active', 'isActive');
    await renameColumnIfExists('message_sequences', 'created_at', 'createdAt');
    await renameColumnIfExists('message_sequences', 'updated_at', 'updatedAt');
    // message_sequence_steps
    await renameColumnIfExists('message_sequence_steps', 'sequence_id', 'sequenceId');
    await renameColumnIfExists('message_sequence_steps', 'order_index', 'orderIndex');
    await renameColumnIfExists('message_sequence_steps', 'delay_amount', 'delayAmount');
    await renameColumnIfExists('message_sequence_steps', 'delay_unit', 'delayUnit');
    await renameColumnIfExists('message_sequence_steps', 'template_id', 'templateId');
    await renameColumnIfExists('message_sequence_steps', 'created_at', 'createdAt');
    await renameColumnIfExists('message_sequence_steps', 'updated_at', 'updatedAt');

    console.log('[migration] alter message tables to camelCase - done');
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
