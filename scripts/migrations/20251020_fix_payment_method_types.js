#!/usr/bin/env node
/**
 * Migration: Fix payment_method_type in payment_transactions
 * 
 * Problem: PIX transactions were incorrectly stored as 'credit_card' due to:
 * 1. checkout/create using 'card' instead of 'credit_card'
 * 2. webhook extracting payment_method from order/charge metadata instead of transaction-level data
 * 3. webhook COALESCE overwriting correct pix values with incorrect credit_card
 * 
 * Solution: Query Pagar.me API for each transaction to get the true payment_method from last_transaction
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PAGARME_API_KEY = process.env.PAGARME_API_KEY;
const PAGARME_BASE_URL = 'https://api.pagar.me/core/v5';

function log(...args) {
  console.log('[fix_payment_method_types]', ...args);
}

async function pagarmeGetOrder(orderId) {
  if (!PAGARME_API_KEY) throw new Error('PAGARME_API_KEY not configured');
  const auth = Buffer.from(`${PAGARME_API_KEY}:`).toString('base64');
  const url = `${PAGARME_BASE_URL}/orders/${orderId}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Pagar.me API error: ${res.status} ${text}`);
  }
  return await res.json();
}

async function main() {
  const DO_EXECUTE = process.argv.includes('--execute');
  log('Starting payment_method_type fix. Execute =', DO_EXECUTE);

  // Find all payment_transactions with provider_order_id
  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, provider_order_id, payment_method_type, status
       FROM payment_transactions
      WHERE provider = 'pagarme' AND provider_order_id IS NOT NULL
      ORDER BY created_at DESC`
  );

  log('Found', rows.length, 'transactions to check');

  let corrected = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      const orderId = row.provider_order_id;
      const currentMethod = row.payment_method_type;
      
      // Query Pagar.me for true payment method
      log('Checking order', orderId, '(current:', currentMethod, ')');
      const order = await pagarmeGetOrder(orderId);
      
      const charges = Array.isArray(order?.charges) ? order.charges : [];
      const charge = charges[0];
      const tx = charge?.last_transaction;
      
      const trueMethod = tx?.payment_method ? String(tx.payment_method).toLowerCase() : null;
      
      if (trueMethod && trueMethod !== currentMethod) {
        log('  → Mismatch found! Should be:', trueMethod);
        if (DO_EXECUTE) {
          await prisma.$executeRawUnsafe(
            `UPDATE payment_transactions SET payment_method_type = $2 WHERE id = $1`,
            row.id,
            trueMethod
          );
          log('  ✓ Updated');
        } else {
          log('  (dry-run, not updating)');
        }
        corrected++;
      } else {
        skipped++;
      }
      
      // Rate limit
      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      log('  ✗ Error:', e.message);
      errors++;
    }
  }

  log('Summary:', {
    total: rows.length,
    corrected,
    skipped,
    errors,
    executed: DO_EXECUTE,
  });
}

main()
  .then(async () => {
    log('Done');
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error('Fatal error:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
