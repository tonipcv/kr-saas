#!/usr/bin/env node
/*
 * Migration: Add business metadata fields to clinics
 * - Adds columns monthly_revenue_range (text) and current_gateway (text)
 * - Idempotent: checks column existence before adding
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client: PgClient } = require('pg');

function redact(url) {
  if (!url) return '(unset)';
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    if (u.username) u.username = '***';
    return u.toString();
  } catch {
    return String(url).replace(/:\/\/([^:]+):([^@]+)@/, '://***:***@');
  }
}

function readSchemaPrisma() {
  const schemaPath = path.resolve(process.cwd(), 'prisma', 'schema.prisma');
  const content = fs.readFileSync(schemaPath, 'utf8');
  return { content, schemaPath };
}

function extractDatasourceUrl(schemaContent) {
  const envMatch = schemaContent.match(/url\s*=\s*env\("([A-Z0-9_]+)"\)/);
  if (envMatch) return process.env[envMatch[1]] || null;
  const litMatch = schemaContent.match(/url\s*=\s*"([^"]+)"/);
  return litMatch ? litMatch[1] : null;
}

async function columnExists(client, table, column) {
  const q = `select 1 from information_schema.columns where table_schema='public' and table_name=$1 and column_name=$2 limit 1`;
  const r = await client.query(q, [table, column]);
  return r.rowCount > 0;
}

async function run() {
  const envUrl = process.env.DATABASE_URL || null;
  const { content: schemaContent, schemaPath } = readSchemaPrisma();
  const schemaUrl = extractDatasourceUrl(schemaContent);
  const dbUrl = envUrl || schemaUrl;
  if (!dbUrl) throw new Error('DATABASE_URL not set and no url found in prisma/schema.prisma');

  console.log('[migrate] schema.prisma:', schemaPath);
  console.log('[migrate] DATABASE_URL (env):', redact(envUrl));
  console.log('[migrate] schema url       :', redact(schemaUrl));
  console.log('[migrate] using DB url     :', redact(dbUrl));

  const client = new PgClient({ connectionString: dbUrl });
  await client.connect();

  try {
    console.log('[migrate] starting transaction');
    await client.query('BEGIN');

    const table = 'clinics';

    if (!(await columnExists(client, table, 'monthly_revenue_range'))) {
      console.log('[migrate] adding clinics.monthly_revenue_range');
      await client.query(`ALTER TABLE ${table} ADD COLUMN monthly_revenue_range text NULL`);
    } else {
      console.log('[migrate] column clinics.monthly_revenue_range already exists');
    }

    if (!(await columnExists(client, table, 'current_gateway'))) {
      console.log('[migrate] adding clinics.current_gateway');
      await client.query(`ALTER TABLE ${table} ADD COLUMN current_gateway text NULL`);
    } else {
      console.log('[migrate] column clinics.current_gateway already exists');
    }

    await client.query('COMMIT');
    console.log('[migrate] done');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[migrate] error:', e && e.message ? e.message : e);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

run().catch((e) => {
  console.error('[migrate] unhandled error', e);
  process.exitCode = 1;
});
