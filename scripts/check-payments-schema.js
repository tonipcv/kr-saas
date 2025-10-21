#!/usr/bin/env node
/*
  Check payments schema health
  - Verifies existence of tables:
      payment_transactions (with provider_charge_id)
      payment_customers
      payment_methods
  - Verifies essential columns
  - Optionally prints simple counts (LIMITED) and sample row keys

  Usage:
    node scripts/check-payments-schema.js
*/

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function tableExists(table) {
  const rows = await prisma.$queryRawUnsafe(
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1) AS exists",
    table
  );
  return Array.isArray(rows) && (rows[0]?.exists === true || rows[0]?.exists === 't');
}

async function columnExists(table, column) {
  const rows = await prisma.$queryRawUnsafe(
    "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2) AS exists",
    table,
    column
  );
  return Array.isArray(rows) && (rows[0]?.exists === true || rows[0]?.exists === 't');
}

async function safeCount(table) {
  try {
    const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(1) AS c FROM ${table}`);
    const c = Array.isArray(rows) ? Number(rows[0]?.c || 0) : 0;
    return Number.isFinite(c) ? c : 0;
  } catch {
    return null;
  }
}

async function sampleRow(table, columns = ['id']) {
  try {
    const cols = columns.map((c) => `"${c}"`).join(', ');
    const rows = await prisma.$queryRawUnsafe(`SELECT ${cols} FROM ${table} ORDER BY 1 DESC LIMIT 1`);
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch {
    return null;
  }
}

async function main() {
  const report = { ok: true, checks: [] };

  // payment_transactions
  const txExists = await tableExists('payment_transactions');
  report.checks.push({ item: 'payment_transactions table', ok: txExists });
  if (!txExists) report.ok = false;
  const txCols = ['id','provider','provider_order_id','doctor_id','patient_profile_id','clinic_id','product_id','amount_cents','currency','installments','payment_method_type','status','raw_payload','created_at','provider_charge_id'];
  for (const col of txCols) {
    const ok = txExists ? await columnExists('payment_transactions', col) : false;
    report.checks.push({ item: `payment_transactions.${col}`, ok });
    if (!ok) report.ok = false;
  }
  const txCount = txExists ? await safeCount('payment_transactions') : null;
  if (txCount != null) report.checks.push({ item: 'payment_transactions.count', ok: true, info: String(txCount) });

  // payment_customers
  const custExists = await tableExists('payment_customers');
  report.checks.push({ item: 'payment_customers table', ok: custExists });
  if (!custExists) report.ok = false;
  const custCols = ['id','provider','provider_customer_id','doctor_id','patient_profile_id','clinic_id','raw_payload','created_at'];
  for (const col of custCols) {
    const ok = custExists ? await columnExists('payment_customers', col) : false;
    report.checks.push({ item: `payment_customers.${col}`, ok });
    if (!ok) report.ok = false;
  }
  const custCount = custExists ? await safeCount('payment_customers') : null;
  if (custCount != null) report.checks.push({ item: 'payment_customers.count', ok: true, info: String(custCount) });

  // payment_methods
  const pmExists = await tableExists('payment_methods');
  report.checks.push({ item: 'payment_methods table', ok: pmExists });
  if (!pmExists) report.ok = false;
  const pmCols = ['id','payment_customer_id','provider_card_id','brand','last4','exp_month','exp_year','is_default','status','raw_payload','created_at'];
  for (const col of pmCols) {
    const ok = pmExists ? await columnExists('payment_methods', col) : false;
    report.checks.push({ item: `payment_methods.${col}`, ok });
    if (!ok) report.ok = false;
  }
  const pmCount = pmExists ? await safeCount('payment_methods') : null;
  if (pmCount != null) report.checks.push({ item: 'payment_methods.count', ok: true, info: String(pmCount) });

  // Print report in a friendly way
  const lines = [];
  lines.push(`Payments Schema Health: ${report.ok ? 'OK' : 'ISSUES FOUND'}`);
  for (const ch of report.checks) {
    lines.push(`${ch.ok ? '✓' : '✗'} ${ch.item}${ch.info ? ` (${ch.info})` : ''}`);
  }
  console.log(lines.join('\n'));

  if (!report.ok) process.exitCode = 2;
}

main().finally(async () => { await prisma.$disconnect(); });
