#!/usr/bin/env node
/*
  Migration: Add confirmationUrl column to products table
  - Idempotent: checks existence before altering
  - Supports PostgreSQL and SQLite (based on DATABASE_URL)
*/

// Load .env if present
try { require('dotenv').config(); } catch {}
const url = process.env.DATABASE_URL || '';

async function migratePostgres() {
  const { Client } = require('pg');
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    console.log('[PG] Connected.');

    const tableCheck = await client.query(`SELECT to_regclass('public."products"') AS exists;`);
    if (!tableCheck.rows[0]?.exists) throw new Error('Table "products" does not exist.');

    const colCheck = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'confirmationUrl'`
    );
    if (colCheck.rowCount > 0) {
      console.log('[PG] Column "confirmationUrl" already exists. Skipping.');
      return;
    }

    console.log('[PG] Adding column "confirmationUrl"...');
    await client.query(`ALTER TABLE public."products" ADD COLUMN "confirmationUrl" TEXT`);
    console.log('[PG] Column added.');
  } finally {
    await client.end().catch(() => {});
  }
}

async function migrateSqlite() {
  const sqlite3 = require('sqlite3');
  const { open } = require('sqlite');

  // DATABASE_URL formats: file:./dev.db or sqlite:... or file:/absolute/path
  let filename = url;
  // Strip prefix patterns
  filename = filename.replace(/^file:/, '').replace(/^sqlite:/, '').replace(/^sqlite:\/\//, '');
  if (!filename) throw new Error('Invalid SQLite DATABASE_URL');

  const db = await open({ filename, driver: sqlite3.Database });
  try {
    console.log('[SQLite] Connected:', filename);
    const table = await db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='products'`);
    if (!table) throw new Error('Table "products" does not exist.');

    const pragma = await db.all(`PRAGMA table_info(products);`);
    const hasColumn = pragma.some((c) => c.name === 'confirmationUrl');
    if (hasColumn) {
      console.log('[SQLite] Column "confirmationUrl" already exists. Skipping.');
      return;
    }

    console.log('[SQLite] Adding column "confirmationUrl"...');
    await db.exec(`ALTER TABLE products ADD COLUMN confirmationUrl TEXT`);
    console.log('[SQLite] Column added.');
  } finally {
    await db.close().catch(() => {});
  }
}

async function main() {
  if (!url) {
    console.error('DATABASE_URL is not set. Please define it in your environment or .env file.');
    process.exit(1);
  }

  try {
    if (/^postgres(?:ql)?:/i.test(url)) {
      await migratePostgres();
    } else if (/^file:|^sqlite:?/i.test(url)) {
      await migrateSqlite();
    } else {
      console.warn('Unrecognized DATABASE_URL. Assuming PostgreSQL.');
      await migratePostgres();
    }
    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err?.message || err);
    process.exit(1);
  }
}

main();
