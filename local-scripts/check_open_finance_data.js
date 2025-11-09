#!/usr/bin/env node
/*
  Checks Open Finance tables for recent data.
  Reads DATABASE_URL from environment. Does read-only SELECTs.
*/

// Load env from .env.local (if present) then .env
try {
  const fs = require('fs');
  const dotenv = require('dotenv');
  if (fs.existsSync('.env.local')) dotenv.config({ path: '.env.local' });
  dotenv.config();
} catch {}

const { Client } = require('pg');

const TABLES = [
  {
    name: 'enrollment_contexts',
    preferredCols: [
      'enrollment_id', 'status', 'device_registered', 'user_id', 'clinic_id',
      'organisation_id', 'authorisation_server_id', 'payer_email', 'payer_document', 'payer_name',
      'created_at', 'updated_at'
    ],
    orderCols: ['updated_at', 'created_at']
  },
  {
    name: 'openbanking_consents',
    preferredCols: [
      'consent_id', 'enrollment_id', 'status', 'amount_cents', 'currency', 'creditor_name', 'creditor_cpf_cnpj', 'product_id', 'clinic_id',
      'created_at', 'updated_at'
    ],
    orderCols: ['updated_at', 'created_at']
  },
  {
    name: 'openbanking_payments',
    preferredCols: [
      'provider_payment_id', 'consent_id', 'transaction_identification', 'status', 'executed_at', 'settled_at',
      'payer_document', 'payer_email', 'payer_name', 'clinic_id', 'product_id', 'purchase_id',
      'created_at', 'updated_at'
    ],
    orderCols: ['updated_at', 'created_at', 'executed_at']
  },
  {
    name: 'payment_customers',
    preferredCols: [
      'id', 'user_id', 'clinic_id', 'email', 'document', 'full_name', 'phones_json',
      'provider', 'provider_customer_id', 'doctor_id', 'patient_profile_id', 'raw_payload',
      'created_at', 'updated_at'
    ],
    orderCols: ['updated_at', 'created_at']
  },
];

function pad(str, len) { str = String(str ?? ''); return str.length >= len ? str : (str + ' '.repeat(len - str.length)); }

async function getExistingColumns(client, table) {
  const sql = `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`;
  const r = await client.query(sql, [table]);
  const cols = new Set(r.rows.map(x => x.column_name));
  return cols;
}

async function countRows(client, table) {
  try {
    const r = await client.query(`SELECT COUNT(*)::bigint AS c FROM ${table}`);
    return BigInt(r.rows[0].c);
  } catch (e) {
    return null;
  }
}

async function selectRecent(client, table, preferredCols, orderCols, limit = 5) {
  try {
    const existing = await getExistingColumns(client, table);
    const cols = preferredCols.filter(c => existing.has(c));
    if (cols.length === 0) return [];
    const order = orderCols.find(c => existing.has(c)) || cols[0];
    const sql = `SELECT ${cols.join(', ')} FROM ${table} ORDER BY ${order} DESC NULLS LAST LIMIT ${limit}`;
    const r = await client.query(sql);
    return r.rows;
  } catch (e) {
    return { error: e.message };
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[check_open_finance_data] DATABASE_URL is not set');
    process.exit(1);
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    console.log('=== Open Finance Data Check ===');
    for (const t of TABLES) {
      console.log(`\n--- ${t.name} ---`);
      const c = await countRows(client, t.name);
      if (c === null) {
        console.log('table not found or cannot count');
        continue;
      }
      console.log('count =', String(c));
      const recent = await selectRecent(client, t.name, t.preferredCols, t.orderCols, 5);
      if (Array.isArray(recent)) {
        if (recent.length === 0) console.log('(no recent rows)');
        recent.forEach((row, idx) => {
          console.log(`#${idx+1}`, row);
        });
      } else if (recent && recent.error) {
        console.log('error selecting rows:', recent.error);
      }
    }
    console.log('\nDone.');
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
