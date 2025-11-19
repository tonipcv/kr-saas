#!/usr/bin/env node
/*
  Payment Orchestration Audit Report
  - Runs 13 sections of SQL audits using Prisma.$queryRawUnsafe
  - Prints a formatted report to stdout and writes audit_report_YYYYMMDD.txt
  - Uses DATABASE_URL automatically via Prisma

  Run:
    node local-scripts/audit_report.js > audit_report_$(date +%Y%m%d).txt
    # or just: node local-scripts/audit_report.js
*/
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function printSectionHeader(title) {
  const bar = '-'.repeat(Math.max(8, title.length));
  return `\n${title}\n${bar}\n`;
}

function toTable(rows) {
  if (!rows || rows.length === 0) return '(no rows)\n';
  const cols = Object.keys(rows[0] || {});
  const widths = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length)));
  const sep = '+' + widths.map((w) => '-'.repeat(w + 2)).join('+') + '+\n';
  const header = '|' + cols.map((c, i) => ' ' + c.padEnd(widths[i]) + ' ').join('|') + '|\n';
  const lines = rows.map((r) => '|' + cols.map((c, i) => ' ' + String(r[c] ?? '').padEnd(widths[i]) + ' ').join('|') + '|\n');
  return sep + header + sep + lines.join('') + sep;
}

// Helper to run a query and safely return rows
async function q(sql, params = []) {
  try {
    const rows = await prisma.$queryRawUnsafe(sql, ...params);
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    return [{ error: e.message || String(e) }];
  }
}

async function main() {
  let report = '';

  // Section 1: Transactions without customer_id (last 30d) by provider
  report += printSectionHeader('1) Transações sem customer_id (30 dias) por provider');
  report += toTable(await q(`
    SELECT LOWER(provider) AS provider, COUNT(*)::int AS count
    FROM payment_transactions
    WHERE customer_id IS NULL
      AND created_at > NOW() - INTERVAL '30 days'
    GROUP BY LOWER(provider)
    ORDER BY count DESC;
  `));

  // Section 2: Paid sessions without linked transaction
  report += printSectionHeader('2) Sessões pagas sem payment_transaction_id');
  report += toTable(await q(`
    SELECT provider, status, COUNT(*)::int AS count
    FROM checkout_sessions
    WHERE payment_transaction_id IS NULL
      AND status = 'paid'
    GROUP BY provider, status
    ORDER BY count DESC;
  `));

  // Section 3: Fill rates of key fields
  report += printSectionHeader('3) Taxa de preenchimento de campos (últimos 7 dias)');
  report += toTable(await q(`
    WITH base AS (
      SELECT * FROM payment_transactions
      WHERE created_at > NOW() - INTERVAL '7 days'
    )
    SELECT 
      ROUND(100.0 * AVG(CASE WHEN customer_id IS NOT NULL THEN 1 ELSE 0 END), 2) AS pct_customer_id,
      ROUND(100.0 * AVG(CASE WHEN customer_provider_id IS NOT NULL THEN 1 ELSE 0 END), 2) AS pct_customer_provider_id,
      ROUND(100.0 * AVG(CASE WHEN provider_v2 IS NOT NULL THEN 1 ELSE 0 END), 2) AS pct_provider_v2,
      ROUND(100.0 * AVG(CASE WHEN status_v2 IS NOT NULL THEN 1 ELSE 0 END), 2) AS pct_status_v2,
      ROUND(100.0 * AVG(CASE WHEN routed_provider IS NOT NULL THEN 1 ELSE 0 END), 2) AS pct_routed_provider
    FROM base;
  `));

  // Section 4: Provider string vs enum usage
  report += printSectionHeader('4) Providers: string livre vs enum (provider_v2)');
  report += toTable(await q(`
    SELECT 
      LOWER(provider) AS provider_string,
      provider_v2,
      COUNT(*)::int AS count
    FROM payment_transactions
    WHERE created_at > NOW() - INTERVAL '90 days'
    GROUP BY LOWER(provider), provider_v2
    ORDER BY count DESC;
  `));

  // Section 5: Status distribution per provider (string)
  report += printSectionHeader('5) Status (string) por provider (90 dias)');
  report += toTable(await q(`
    SELECT LOWER(provider) AS provider, LOWER(status) AS status, COUNT(*)::int AS count
    FROM payment_transactions
    WHERE created_at > NOW() - INTERVAL '90 days'
    GROUP BY LOWER(provider), LOWER(status)
    ORDER BY count DESC;
  `));

  // Section 6: Status_v2 distribution per provider (enum)
  report += printSectionHeader('6) Status_v2 (enum) por provider (90 dias)');
  report += toTable(await q(`
    SELECT provider_v2, status_v2, COUNT(*)::int AS count
    FROM payment_transactions
    WHERE created_at > NOW() - INTERVAL '90 days'
    GROUP BY provider_v2, status_v2
    ORDER BY count DESC;
  `));

  // Section 7: Duplicated customers (unified customers)
  report += printSectionHeader('7) Clientes duplicados (customers) por email');
  report += toTable(await q(`
    SELECT email, COUNT(*)::int AS count
    FROM customers
    WHERE email IS NOT NULL AND email <> ''
    GROUP BY email
    HAVING COUNT(*) > 1
    ORDER BY count DESC, email ASC
    LIMIT 50;
  `));

  // Section 8: Legacy vs unified customer usage
  report += printSectionHeader('8) Uso de tabelas antigas (payment_customers) x novas (customers)');
  report += toTable(await q(`
    SELECT 'customers' AS table, COUNT(*)::int AS count FROM customers
    UNION ALL
    SELECT 'payment_customers' AS table, COUNT(*)::int AS count FROM payment_customers;
  `));

  // Section 9: Checkout sessions linkage ratio by provider
  report += printSectionHeader('9) CheckoutSessions: taxa de link com transação por provider (30 dias)');
  report += toTable(await q(`
    WITH base AS (
      SELECT * FROM checkout_sessions WHERE created_at > NOW() - INTERVAL '30 days'
    )
    SELECT COALESCE(provider::text, 'NULL') AS provider,
           COUNT(*)::int AS total,
           SUM(CASE WHEN payment_transaction_id IS NOT NULL THEN 1 ELSE 0 END)::int AS linked,
           ROUND(100.0 * AVG(CASE WHEN payment_transaction_id IS NOT NULL THEN 1 ELSE 0 END), 2) AS linked_pct
    FROM base
    GROUP BY provider
    ORDER BY total DESC;
  `));

  // Section 10: Financial exposure without customer linkage (last 30d)
  report += printSectionHeader('10) Valor (centavos) sem customer_id (30 dias)');
  report += toTable(await q(`
    SELECT LOWER(provider) AS provider,
           SUM(amount_cents)::bigint AS amount_cents,
           COUNT(*)::int AS tx_count
    FROM payment_transactions
    WHERE customer_id IS NULL
      AND created_at > NOW() - INTERVAL '30 days'
    GROUP BY LOWER(provider)
    ORDER BY amount_cents DESC NULLS LAST;
  `));

  // Section 11: Payment methods captured (customer_payment_methods)
  report += printSectionHeader('11) Métodos de pagamento salvos (por provider)');
  report += toTable(await q(`
    SELECT provider, COUNT(*)::int AS methods
    FROM customer_payment_methods
    GROUP BY provider
    ORDER BY methods DESC;
  `));

  // Section 12: Gateway comparison (high level counts)
  report += printSectionHeader('12) Comparativo gateways (últimos 30 dias)');
  report += toTable(await q(`
    SELECT LOWER(provider) AS provider,
           COUNT(*)::int AS tx_total,
           SUM(CASE WHEN LOWER(status) IN ('paid','succeeded','pago','authorized','completed') THEN 1 ELSE 0 END)::int AS tx_paid,
           ROUND(100.0 * AVG(CASE WHEN LOWER(status) IN ('paid','succeeded','pago','authorized','completed') THEN 1 ELSE 0 END), 2) AS paid_pct,
           SUM(CASE WHEN customer_id IS NULL THEN 1 ELSE 0 END)::int AS no_customer
    FROM payment_transactions
    WHERE created_at > NOW() - INTERVAL '30 days'
    GROUP BY LOWER(provider)
    ORDER BY tx_total DESC;
  `));

  // Section 13: Executive summary (OK/Medium/Critical)
  report += printSectionHeader('13) Resumo Executivo (Status)');
  report += toTable(await q(`
    WITH agg AS (
      SELECT 
        ROUND(100.0 * AVG(CASE WHEN customer_id IS NOT NULL THEN 1 ELSE 0 END), 2) AS pct_customer,
        ROUND(100.0 * AVG(CASE WHEN provider_v2 IS NOT NULL THEN 1 ELSE 0 END), 2) AS pct_provider_enum,
        ROUND(100.0 * AVG(CASE WHEN status_v2 IS NOT NULL THEN 1 ELSE 0 END), 2) AS pct_status_enum
      FROM payment_transactions
      WHERE created_at > NOW() - INTERVAL '30 days'
    )
    SELECT 
      CASE WHEN pct_customer = 100 THEN '✅' WHEN pct_customer >= 80 THEN '⚠️' ELSE '🚨' END AS customers,
      CASE WHEN pct_provider_enum = 100 THEN '✅' WHEN pct_provider_enum >= 80 THEN '⚠️' ELSE '🚨' END AS provider_enums,
      CASE WHEN pct_status_enum = 100 THEN '✅' WHEN pct_status_enum >= 80 THEN '⚠️' ELSE '🚨' END AS status_enums
    FROM agg;
  `));

  // Output
  const outPath = path.resolve(process.cwd(), `audit_report_${nowStamp()}.txt`);
  fs.writeFileSync(outPath, report, 'utf8');
  process.stdout.write(report);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
