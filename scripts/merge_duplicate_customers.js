#!/usr/bin/env node
/**
 * Merge duplicate customers by email within the same merchant.
 *
 * Usage:
 *   node scripts/merge_duplicate_customers.js --slug <CLINIC_SLUG>
 *   node scripts/merge_duplicate_customers.js --clinicId <CLINIC_ID>
 *   node scripts/merge_duplicate_customers.js --merchantId <MERCHANT_ID>
 *   node scripts/merge_duplicate_customers.js --merchantId <MERCHANT_ID> --dry
 *
 * Strategy:
 * - Resolve merchantId (from clinicId if provided)
 * - Find groups of customers with same lower(email) for that merchant
 * - For each group, pick a canonical row (most complete; fallback: latest updated_at)
 * - Repoint FKs from duplicates to canonical in:
 *   - customer_providers.customer_id
 *   - customer_payment_methods.customer_id
 *   - customer_subscriptions.customer_id
 *   - payment_transactions.customer_id
 * - Delete duplicate rows
 */

const { Client: PgClient } = require('pg');
const fs = require('fs');
const path = require('path');
try {
  const envLocal = path.resolve(process.cwd(), '.env.local');
  const envDevLocal = path.resolve(process.cwd(), '.env.development.local');
  if (fs.existsSync(envLocal)) require('dotenv').config({ path: envLocal });
  if (fs.existsSync(envDevLocal)) require('dotenv').config({ path: envDevLocal });
  require('dotenv').config(); // fallback to .env
} catch {}

function arg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0) return process.argv[idx + 1] || true;
  return null;
}

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

async function main() {
  const slug = arg('slug');
  const clinicId = arg('clinicId');
  let merchantId = arg('merchantId');
  const dry = !!arg('dry');

  // Resolve DATABASE_URL from env or prisma/schema.prisma
  let databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || null;
  if (!databaseUrl) {
    try {
      const schemaPath = path.resolve(process.cwd(), 'prisma', 'schema.prisma');
      if (fs.existsSync(schemaPath)) {
        const content = fs.readFileSync(schemaPath, 'utf8');
        // Try to find a hardcoded url = "..." OR env("DATABASE_URL")
        const urlMatch = content.match(/datasource\s+db\s*\{[\s\S]*?url\s*=\s*"([^"]+)"/);
        if (urlMatch && urlMatch[1] && !/env\(/i.test(urlMatch[1])) {
          databaseUrl = urlMatch[1];
        }
      }
    } catch {}
  }
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL env is required. You can run:\n  export DATABASE_URL=postgres://user:pass@host:5432/db\n  node scripts/merge_duplicate_customers.js --slug <SLUG> --dry');
    process.exit(1);
  }

  const client = new PgClient({ connectionString: databaseUrl });
  await client.connect();
  console.log('[merge_duplicate_customers] DB:', redact(databaseUrl));

  try {
    // Resolve merchant from slug or clinicId
    if (!merchantId && slug) {
      const r = await client.query(
        `SELECT m.id AS merchant_id
           FROM clinics c
           LEFT JOIN merchants m ON m.clinic_id = c.id
          WHERE c.slug = $1 OR c.subdomain = $1
          LIMIT 1`,
        [String(slug)]
      );
      merchantId = r.rows[0]?.merchant_id || null;
      if (!merchantId) {
        console.error('ERROR: No merchant found for slug:', slug);
        process.exit(1);
      }
    }
    if (!merchantId && clinicId) {
      const r = await client.query('SELECT id FROM merchants WHERE clinic_id = $1 LIMIT 1', [String(clinicId)]);
      merchantId = r.rows[0]?.id || null;
      if (!merchantId) {
        console.error('ERROR: No merchant found for clinicId:', clinicId);
        process.exit(1);
      }
    }
    if (!merchantId) {
      console.error('ERROR: must provide --slug or --clinicId or --merchantId');
      process.exit(1);
    }

    console.log('[merge_duplicate_customers] merchantId =', merchantId);

    // Find duplicate groups by lower(email)
    const dupSql = `
      SELECT lower(email) AS le, merchant_id, array_agg(id) AS ids, COUNT(1) AS cnt
        FROM customers
       WHERE merchant_id = $1
         AND email IS NOT NULL
         AND btrim(email) <> ''
       GROUP BY 1,2
      HAVING COUNT(1) > 1
       ORDER BY cnt DESC
    `;
    const { rows: groups } = await client.query(dupSql, [String(merchantId)]);
    console.log(`[merge_duplicate_customers] found ${groups.length} duplicate email group(s)`);
    if (groups.length === 0) return;

    for (const g of groups) {
      const le = g.le;
      const ids = g.ids;
      console.log('\n[merge] email =', le, '| candidates =', ids.length);

      // Load full rows to choose canonical
      const { rows: custs } = await client.query(
        `SELECT id, name, email, phone, document, created_at, updated_at
           FROM customers
          WHERE id = ANY($1::uuid[])`,
        [ids]
      );

      // Pick canonical: most complete fields -> latest updated_at
      const score = (c) => {
        let s = 0;
        if (c.name && String(c.name).trim()) s += 1;
        if (c.email && String(c.email).trim()) s += 1;
        if (c.phone && String(c.phone).trim()) s += 1;
        if (c.document && String(c.document).trim()) s += 1;
        return s;
      };
      custs.sort((a, b) => {
        const sb = score(b) - score(a);
        if (sb !== 0) return sb;
        const ta = new Date(a.updated_at || a.created_at || 0).getTime();
        const tb = new Date(b.updated_at || b.created_at || 0).getTime();
        return tb - ta;
      });
      const canonical = custs[0];
      const dupIds = custs.slice(1).map((c) => c.id);
      console.log('[merge] canonical =', canonical.id, '| duplicates =', dupIds.length ? dupIds.join(',') : '(none)');
      if (dupIds.length === 0) continue;

      if (dry) {
        console.log('[dry-run] would repoint relations to', canonical.id, 'and delete', dupIds.length, 'rows');
        continue;
      }

      // Begin transaction per group for safety
      await client.query('BEGIN');
      try {
        const params = [canonical.id, dupIds];
        const tables = [
          { table: 'customer_providers', col: 'customer_id' },
          { table: 'customer_payment_methods', col: 'customer_id' },
          { table: 'customer_subscriptions', col: 'customer_id' },
          { table: 'payment_transactions', col: 'customer_id' },
        ];
        for (const t of tables) {
          const sql = `UPDATE ${t.table} SET ${t.col} = $1::uuid WHERE ${t.col} = ANY($2::uuid[])`;
          const res = await client.query(sql, params);
          console.log(`[merge] ${t.table} updated:`, res.rowCount);
        }

        // Best-effort: merge basic fields from duplicates into canonical when missing
        const mergeFields = await client.query(
          `SELECT 
             COALESCE(NULLIF(btrim($2::text), ''), name) AS name,
             COALESCE(NULLIF(btrim($3::text), ''), email) AS email,
             COALESCE(NULLIF(btrim($4::text), ''), phone) AS phone,
             COALESCE(NULLIF(btrim($5::text), ''), document) AS document
           FROM customers WHERE id = $1::uuid`,
          [canonical.id, canonical.name, canonical.email, canonical.phone, canonical.document]
        );
        const mf = mergeFields.rows[0] || {};
        await client.query(
          `UPDATE customers
              SET name = $2,
                  email = $3,
                  phone = $4,
                  document = $5,
                  updated_at = NOW()
            WHERE id = $1::uuid`,
          [canonical.id, mf.name || null, mf.email || null, mf.phone || null, mf.document || null]
        );

        // Delete duplicates
        const del = await client.query('DELETE FROM customers WHERE id = ANY($1::uuid[])', [dupIds]);
        console.log('[merge] deleted duplicates:', del.rowCount);

        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('[merge] failed:', e.message || e);
        process.exitCode = 1;
      }
    }

    console.log('\n[merge_duplicate_customers] done');
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((e) => {
  console.error('fatal:', e.message || e);
  process.exit(1);
});
