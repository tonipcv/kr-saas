#!/usr/bin/env node
require('dotenv').config()
/*
  Adds client_name and client_email columns to payment_transactions if missing
  and backfills them from raw_payload.buyer when available.

  Usage:
    DATABASE_URL=postgres://... node scripts/ddl_add_payment_tx_client_columns.js
*/

const { Client } = require('pg')

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL not set')
    process.exit(1)
  }
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    console.log('> Ensuring columns client_name, client_email exist...')
    await client.query(`
      ALTER TABLE payment_transactions
      ADD COLUMN IF NOT EXISTS client_name text;
    `)
    await client.query(`
      ALTER TABLE payment_transactions
      ADD COLUMN IF NOT EXISTS client_email text;
    `)
    console.log('> Columns ensured.')

    console.log('> Backfilling from raw_payload.buyer where missing...')
    await client.query(`
      UPDATE payment_transactions
         SET client_name = COALESCE(client_name, raw_payload->'buyer'->>'name'),
             client_email = COALESCE(client_email, raw_payload->'buyer'->>'email')
       WHERE provider = 'stripe'
         AND (client_name IS NULL OR client_name = '' OR client_email IS NULL OR client_email = '');
    `)
    console.log('> Backfill done.')
  } finally {
    await client.end()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
