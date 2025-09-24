#!/usr/bin/env node
/**
 * Diagnostic script to check message_* tables structure
 * Prints column names, types, and constraints
 */

const { prisma } = require('../dist/lib/prisma');

async function checkTable(tableName) {
  console.log(`\n=== TABLE: ${tableName} ===`);
  
  // Get column info
  const columns = await prisma.$queryRawUnsafe(`
    SELECT column_name, data_type, udt_name, character_maximum_length, column_default, is_nullable
    FROM information_schema.columns 
    WHERE table_name = $1
    ORDER BY ordinal_position
  `, tableName);
  
  console.log('COLUMNS:');
  columns.forEach(col => {
    console.log(`  - ${col.column_name}: ${col.data_type}${col.character_maximum_length ? `(${col.character_maximum_length})` : ''} ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}${col.column_default ? ` DEFAULT ${col.column_default}` : ''}`);
  });
  
  // Check for enum types
  try {
    const enumTypes = await prisma.$queryRawUnsafe(`
      SELECT t.typname AS enum_name, e.enumlabel AS enum_value
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      ORDER BY t.typname, e.enumsortorder
    `);
    
    if (enumTypes.length > 0) {
      const enumsByType = {};
      enumTypes.forEach(e => {
        if (!enumsByType[e.enum_name]) enumsByType[e.enum_name] = [];
        enumsByType[e.enum_name].push(e.enum_value);
      });
      
      console.log('\nENUM TYPES:');
      Object.entries(enumsByType).forEach(([name, values]) => {
        console.log(`  - ${name}: ${values.join(', ')}`);
      });
    }
  } catch (e) {
    console.log('Error checking enum types:', e.message);
  }
  
  // Check for constraints
  try {
    const constraints = await prisma.$queryRawUnsafe(`
      SELECT conname, contype, pg_get_constraintdef(c.oid) as def
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = $1
    `, tableName);
    
    if (constraints.length > 0) {
      console.log('\nCONSTRAINTS:');
      constraints.forEach(c => {
        const type = {
          'p': 'PRIMARY KEY',
          'f': 'FOREIGN KEY',
          'u': 'UNIQUE',
          'c': 'CHECK',
        }[c.contype] || c.contype;
        
        console.log(`  - ${c.conname} (${type}): ${c.def}`);
      });
    }
  } catch (e) {
    console.log('Error checking constraints:', e.message);
  }
}

async function run() {
  try {
    console.log('=== MESSAGE TABLES DIAGNOSTIC ===');
    
    await checkTable('message_templates');
    await checkTable('message_sequences');
    await checkTable('message_sequence_steps');
    
    // Check if specific enum types exist
    const enumTypes = ['MessageChannel', 'TimeUnit', 'RenderStrategy'];
    for (const type of enumTypes) {
      const exists = await prisma.$queryRawUnsafe(`
        SELECT 1 FROM pg_type WHERE typname = $1 LIMIT 1
      `, type);
      
      console.log(`\nEnum type '${type}' exists: ${exists.length > 0 ? 'YES' : 'NO'}`);
    }
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
