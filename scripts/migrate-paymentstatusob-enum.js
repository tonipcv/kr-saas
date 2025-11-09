#!/usr/bin/env node
/*
  Migration: extend enum PaymentStatusOB with additional values used by Open Finance flow.
  - Adds: PENDING, PROCESSING, COMPLETED, REJECTED, CANCELLED, EXPIRED, ACCP, PAGO, RJCT, CANC (idempotent)

  Usage:
    node scripts/migrate-paymentstatusob-enum.js

  Requirements:
    - DATABASE_URL must be set in environment (.env)
*/
const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const REQUIRED_VALUES = [
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
  // Keep existing short codes for compatibility
  'ACCP',
  'PAGO',
  'RJCT',
  'CANC',
];

async function main() {
  const cn = process.env.DATABASE_URL;
  if (!cn) {
    console.error('[migrate-paymentstatusob] Missing DATABASE_URL in environment');
    process.exit(1);
  }
  const client = new Client({ connectionString: cn });
  await client.connect();
  try {
    console.log('[migrate-paymentstatusob] Connected');
    // Fetch existing enum labels
    const q = `
      SELECT e.enumlabel AS label
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname = $1
      ORDER BY e.enumsortorder
    `;
    const { rows } = await client.query(q, ['PaymentStatusOB']);
    const existing = new Set(rows.map(r => r.label));
    console.log('[migrate-paymentstatusob] existing:', Array.from(existing).join(', '));

    const toAdd = REQUIRED_VALUES.filter(v => !existing.has(v));
    if (toAdd.length === 0) {
      console.log('[migrate-paymentstatusob] Nothing to add. Up to date.');
      return;
    }

    // Add missing values one by one at the end of enum ordering
    for (const val of toAdd) {
      const sql = `ALTER TYPE "PaymentStatusOB" ADD VALUE '${val}'`;
      console.log('[migrate-paymentstatusob] adding:', val);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        // If value already exists (race or rerun), skip; else rethrow
        const msg = String(e.message || e);
        if (/already exists/i.test(msg)) {
          console.warn('[migrate-paymentstatusob] already exists, skipping:', val);
        } else {
          console.error('[migrate-paymentstatusob] failed for', val, e);
          throw e;
        }
      }
    }

    console.log('[migrate-paymentstatusob] Done.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[migrate-paymentstatusob] ERROR:', err);
  process.exit(1);
});
