#!/usr/bin/env node
/*
  Creates payment tables for tokenized cards & transactions (Pagar.me v5)
  Usage: node scripts/migrations/20251005_create_payment_tables.js
*/

const fs = require('fs');
const path = require('path');
const { prisma } = require('../../dist/lib/prisma.js');

async function main() {
  const sqlPath = path.resolve(__dirname, '../sql/20251005_create_payment_tables.sql.txt');
  console.log('[migration] Starting: payment tables');
  if (!fs.existsSync(sqlPath)) {
    throw new Error('SQL file not found: ' + sqlPath);
  }
  const raw = fs.readFileSync(sqlPath, 'utf8');
  if (!raw || !raw.trim()) throw new Error('SQL file is empty');

  // Normalize: remove BEGIN/COMMIT and comments, split by semicolon
  const cleaned = raw
    .replace(/--.*$/gm, '')
    .replace(/\bBEGIN\b;?/gi, '')
    .replace(/\bCOMMIT\b;?/gi, '');

  const stmts = cleaned
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of stmts) {
    // Use individual executions to avoid prepared statement multi-command error
    await prisma.$executeRawUnsafe(stmt);
  }

  console.log('[migration] Done.');
}

main()
  .catch((e) => { console.error('[migration] Error:', e); process.exit(1); })
  .finally(async () => { try { await prisma.$disconnect(); } catch {} });
