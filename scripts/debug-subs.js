// scripts/debug-subs.js
// Usage:
//   node scripts/debug-subs.js inspect
//   node scripts/debug-subs.js insert
//   node scripts/debug-subs.js list

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function getColumns(table) {
  try {
    const rows = await prisma.$queryRawUnsafe(
      "SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position",
      table
    );
    return rows.map(r => r.column_name);
  } catch (e) {
    return [];
  }
}

function uuid() {
  return (global.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`);
}

async function inspect() {
  const subCols = await getColumns('customer_subscriptions');
  const custCols = await getColumns('customers');

  let subsSample = [];
  let custsSample = [];
  try { subsSample = await prisma.$queryRawUnsafe('SELECT * FROM customer_subscriptions ORDER BY 1 DESC LIMIT 5'); } catch {}
  try { custsSample = await prisma.$queryRawUnsafe('SELECT * FROM customers ORDER BY 1 DESC LIMIT 5'); } catch {}

  return { subCols, custCols, subsSample, custsSample };
}

async function insertOne() {
  const subCols = await getColumns('customer_subscriptions');

  const take = (camel, snake) => subCols.includes(camel) ? camel : (subCols.includes(snake) ? snake : null);

  const col_id           = take('id', 'id');
  const col_merchantId   = take('merchantId', 'merchant_id');
  const col_customerId   = take('customerId', 'customer_id');
  const col_productId    = take('productId', 'product_id');
  const col_offerId      = take('offerId', 'offer_id');
  const col_provider     = take('provider', 'provider');
  const col_accountId    = take('accountId', 'account_id');
  const col_providerSub  = take('providerSubscriptionId', 'provider_subscription_id');
  const col_status       = take('status', 'status');
  const col_priceCents   = take('priceCents', 'price_cents');
  const col_currency     = take('currency', 'currency');
  const col_startAt      = take('startAt', 'start_at');

  const cols = [];
  const vals = [];
  const ph   = [];

  const push = (c, v) => {
    if (c) {
      cols.push('"' + c + '"');
      vals.push(v);
      const idx = '$' + vals.length;
      // Add enum casts when needed
      if (c === 'provider') ph.push(idx + '::"PaymentProvider"');
      else if (c === 'status') ph.push(idx + '::"SubscriptionStatus"');
      else if (c === 'currency') ph.push(idx + '::"Currency"');
      else ph.push(idx);
    }
  };

  const newId = uuid();
  push(col_id, newId);
  push(col_merchantId, 'debug_merchant');
  push(col_customerId, 'debug_customer');
  push(col_productId, 'debug_product');
  if (col_offerId) push(col_offerId, null);
  push(col_provider, 'STRIPE');
  if (col_accountId) push(col_accountId, null);
  if (col_providerSub) push(col_providerSub, 'sub_debug_' + Math.random().toString(36).slice(2));
  push(col_status, 'ACTIVE');
  push(col_priceCents, 1000);
  push(col_currency, 'USD');
  if (col_startAt) push(col_startAt, new Date());

  if (cols.length === 0) {
    return { error: 'No compatible columns found for insert' };
  }

  const sql = `INSERT INTO "customer_subscriptions" (${cols.join(', ')}) VALUES (${ph.join(', ')})`;
  try {
    const res = await prisma.$executeRawUnsafe(sql, ...vals);
    return { ok: true, sql, res, id: newId };
  } catch (e) {
    return { error: e.message || String(e), sql };
  }
}

async function list() {
  try {
    const rows = await prisma.$queryRawUnsafe('SELECT * FROM customer_subscriptions ORDER BY 1 DESC LIMIT 10');
    return rows;
  } catch (e) {
    return { error: e.message || String(e) };
  }
}

(async () => {
  const cmd = process.argv[2] || 'inspect';
  try {
    if (cmd === 'inspect') {
      const out = await inspect();
      console.log(JSON.stringify(out, null, 2));
    } else if (cmd === 'insert') {
      const out = await insertOne();
      console.log(JSON.stringify(out, null, 2));
    } else if (cmd === 'list') {
      const out = await list();
      console.log(JSON.stringify(out, null, 2));
    } else {
      console.log('Usage: node scripts/debug-subs.js [inspect|insert|list]');
    }
  } catch (e) {
    console.error('script_error', e);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
})();
