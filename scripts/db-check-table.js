#!/usr/bin/env node
/*
 Usage:
   node scripts/db-check-table.js payment_transactions
*/
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  const table = process.argv[2];
  if (!table) {
    console.error('Usage: node scripts/db-check-table.js <table_name>');
    process.exit(1);
  }
  try {
    const rows = await prisma.$queryRawUnsafe(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1) AS exists",
      table
    );
    const exists = Array.isArray(rows) && (rows[0]?.exists === true || rows[0]?.exists === 't');
    console.log(`Table ${table}: ${exists ? 'EXISTS' : 'DOES NOT EXIST'}`);
  } catch (e) {
    console.error('Error querying information_schema:', e?.message || e);
    process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}

main();
