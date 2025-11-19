#!/usr/bin/env node
/*
List clinics that have payment transactions but no merchant onboarded
- Shows counts per provider_v2 and total in the last 90 days
- Helps prioritize merchant onboarding to unlock customer_providers links

Run:
  node local-scripts/list_clinics_missing_merchants.js
*/
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function section(t){ console.log(`\n${t}\n${'-'.repeat(t.length)}`); }

async function q(sql, ...params) {
  try {
    const rows = await prisma.$queryRawUnsafe(sql, ...params);
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    console.error('Query error:', e?.message || String(e));
    return [];
  }
}

function printTable(rows){
  if (!rows || rows.length === 0) { console.log('(no rows)'); return; }
  const cols = Object.keys(rows[0]);
  const widths = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length)));
  const sep = '+' + widths.map(w => '-'.repeat(w + 2)).join('+') + '+\n';
  const header = '|' + cols.map((c,i)=>' ' + c.padEnd(widths[i]) + ' ').join('|') + '|\n';
  const lines = rows.map(r => '|' + cols.map((c,i)=>' ' + String(r[c] ?? '').padEnd(widths[i]) + ' ').join('|') + '|\n');
  process.stdout.write(sep + header + sep + lines.join('') + sep);
}

async function main(){
  section('Clinics with transactions but missing merchants (last 90 days)');
  const rows = await q(`
    WITH tx AS (
      SELECT clinic_id, provider_v2
      FROM payment_transactions
      WHERE created_at > NOW() - INTERVAL '90 days'
      GROUP BY clinic_id, provider_v2
    )
    SELECT c.id AS clinic_id,
           COALESCE(c.name,'—') AS clinic_name,
           COUNT(*) FILTER (WHERE t.provider_v2 = 'PAGARME')::int AS pagarme,
           COUNT(*) FILTER (WHERE t.provider_v2 = 'APPMAX')::int AS appmax,
           COUNT(*) FILTER (WHERE t.provider_v2 = 'OPENFINANCE')::int AS openfinance,
           COUNT(*) FILTER (WHERE t.provider_v2 = 'STRIPE')::int AS stripe,
           COUNT(*)::int AS providers_with_activity
    FROM tx t
    JOIN clinics c ON c.id = t.clinic_id
    LEFT JOIN merchants m ON m.clinic_id = c.id
    WHERE m.id IS NULL
    GROUP BY c.id, c.name
    ORDER BY providers_with_activity DESC, c.name ASC;
  `);
  printTable(rows);
}

main().catch(e=>{console.error(e); process.exit(1);}).finally(async()=>{await prisma.$disconnect();});
