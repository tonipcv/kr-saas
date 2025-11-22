#!/usr/bin/env node
const { Client } = require('pg')

async function run() {
  const cmd = String(process.argv[2] || '').toLowerCase()
  if (!cmd || !['guard', 'drop', 'backfill', 'verify'].includes(cmd)) {
    console.error('Usage: node local-scripts/stage2_legacy_cleanup.js <guard|drop|backfill|verify>')
    process.exit(1)
  }
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('DATABASE_URL env var is required')
    process.exit(1)
  }
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()

  try {
    if (cmd === 'guard') {
      await client.query('BEGIN')
      // Rename legacy tables if they exist
      await client.query(`DO $$
      BEGIN
        IF to_regclass('public.payment_customers') IS NOT NULL THEN
          EXECUTE 'ALTER TABLE payment_customers RENAME TO payment_customers_legacy';
        END IF;
        IF to_regclass('public.payment_methods') IS NOT NULL THEN
          EXECUTE 'ALTER TABLE payment_methods RENAME TO payment_methods_legacy';
        END IF;
      END$$;`)
      // Create deny-write function if not exists
      await client.query(`DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_proc WHERE proname = 'deny_legacy_writes'
        ) THEN
          CREATE OR REPLACE FUNCTION deny_legacy_writes() RETURNS trigger AS $$
          BEGIN
            RAISE EXCEPTION 'Legacy table/view is deprecated. Write attempted.';
          END; $$ LANGUAGE plpgsql;
        END IF;
      END$$;`)
      // Create views mapped to legacy with no rows and triggers to deny writes
      await client.query(`DO $$
      BEGIN
        IF to_regclass('public.payment_customers_legacy') IS NOT NULL THEN
          EXECUTE 'CREATE OR REPLACE VIEW payment_customers AS SELECT * FROM payment_customers_legacy WHERE false';
          IF NOT EXISTS (
            SELECT 1 FROM pg_trigger WHERE tgname = 'trg_deny_payment_customers_writes'
          ) THEN
            EXECUTE 'CREATE TRIGGER trg_deny_payment_customers_writes INSTEAD OF INSERT OR UPDATE OR DELETE ON payment_customers FOR EACH STATEMENT EXECUTE FUNCTION deny_legacy_writes()';
          END IF;
        END IF;
        IF to_regclass('public.payment_methods_legacy') IS NOT NULL THEN
          EXECUTE 'CREATE OR REPLACE VIEW payment_methods AS SELECT * FROM payment_methods_legacy WHERE false';
          IF NOT EXISTS (
            SELECT 1 FROM pg_trigger WHERE tgname = 'trg_deny_payment_methods_writes'
          ) THEN
            EXECUTE 'CREATE TRIGGER trg_deny_payment_methods_writes INSTEAD OF INSERT OR UPDATE OR DELETE ON payment_methods FOR EACH STATEMENT EXECUTE FUNCTION deny_legacy_writes()';
          END IF;
        END IF;
      END$$;`)
      await client.query('COMMIT')
      console.log('[stage2][guard] Done: legacy tables renamed to *_legacy and guard views/triggers created')
    }

    if (cmd === 'drop') {
      await client.query('BEGIN')
      await client.query(`DROP VIEW IF EXISTS payment_methods; DROP VIEW IF EXISTS payment_customers;`)
      await client.query(`DO $$
      BEGIN
        IF to_regclass('public.payment_methods_legacy') IS NOT NULL THEN
          EXECUTE 'DROP TABLE payment_methods_legacy CASCADE';
        END IF;
        IF to_regclass('public.payment_customers_legacy') IS NOT NULL THEN
          EXECUTE 'DROP TABLE payment_customers_legacy CASCADE';
        END IF;
      END$$;`)
      await client.query('COMMIT')
      console.log('[stage2][drop] Done: guard views dropped and legacy tables removed')
    }

    if (cmd === 'backfill') {
      // Best-effort backfill customer_id using email present in raw_payload
      // Warning: This is heuristic and should be limited by provider and time window if needed
      const dryRun = process.env.DRY_RUN === '1'
      const limit = Number(process.env.LIMIT || 5000)
      console.log(`[stage2][backfill] Starting backfill (dryRun=${dryRun}) limit=${limit}`)
      const selectSql = `
        SELECT pt.id, pt.provider, pt.raw_payload::text AS raw
        FROM payment_transactions pt
        WHERE pt.customer_id IS NULL
        ORDER BY pt.created_at DESC
        LIMIT $1
      `
      const { rows } = await client.query(selectSql, [limit])
      let updates = 0
      for (const r of rows) {
        const raw = r.raw || ''
        const emailMatch = raw.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,7}/)
        if (!emailMatch) continue
        const email = emailMatch[0].toLowerCase()
        const cust = await client.query(
          `SELECT id FROM customers WHERE LOWER(email) = $1 ORDER BY created_at DESC LIMIT 1`,
          [email]
        )
        const customerId = cust.rows?.[0]?.id || null
        if (!customerId) continue
        if (dryRun) {
          updates++
          continue
        }
        await client.query(
          `UPDATE payment_transactions SET customer_id = $2, updated_at = NOW() WHERE id = $1`,
          [r.id, customerId]
        )
        updates++
      }
      console.log(`[stage2][backfill] Completed. Updated ${updates} rows`)
    }

    if (cmd === 'verify') {
      // Check if any new rows landed in legacy tables in the last N minutes
      const minutes = Number(process.env.MINUTES || 60)
      console.log(`[stage2][verify] Checking legacy writes in last ${minutes} minutes`)
      const res = await client.query(`
        SELECT 'payment_customers_legacy' AS table, COUNT(*) AS cnt
        FROM payment_customers_legacy
        WHERE created_at >= NOW() - ($1 || ' minutes')::interval
        UNION ALL
        SELECT 'payment_methods_legacy' AS table, COUNT(*) AS cnt
        FROM payment_methods_legacy
        WHERE created_at >= NOW() - ($1 || ' minutes')::interval
      `, [minutes])
      console.table(res.rows)
    }
  } catch (e) {
    try { await client.query('ROLLBACK') } catch {}
    console.error('[stage2][error]', e?.message || e)
    process.exit(1)
  } finally {
    await client.end()
  }
}

run()
