#!/usr/bin/env node
/*
 * Worker: Marks expired unpaid PIX sessions as abandoned and records reminders
 * Safe to run periodically (cron). Idempotent.
 */

const fs = require('fs');
const path = require('path');
const { Client: PgClient } = require('pg');

try {
  const dotenv = require('dotenv');
  const root = process.cwd();
  const envPath = path.resolve(root, '.env');
  const envLocalPath = path.resolve(root, '.env.local');
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
  if (fs.existsSync(envLocalPath)) dotenv.config({ path: envLocalPath, override: true });
} catch {}

function redact(url) {
  if (!url) return '(unset)';
  try { const u = new URL(url); if (u.password) u.password = '***'; if (u.username) u.username = '***'; return u.toString(); } catch { return String(url).replace(/:\/\/([^:]+):([^@]+)@/, '://***:***@'); }
}

function isRemindersEnabled() {
  return String(process.env.CHECKOUT_REMINDERS_ENABLED || '').toLowerCase() === 'true';
}

async function run() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not set');
  const client = new PgClient({ connectionString: dbUrl });
  await client.connect();

  console.log('[worker] DB:', redact(dbUrl));

  try {
    const now = new Date();

    // 1) Mark expired PIX (status=pix_generated AND pix_expires_at < now) as abandoned
    const res1 = await client.query(`
      UPDATE checkout_sessions
      SET status = 'abandoned', updated_at = NOW()
      WHERE status = 'pix_generated' AND pix_expires_at IS NOT NULL AND pix_expires_at < NOW()
      RETURNING id, resume_token
    `);
    if (res1.rowCount) console.log('[worker] marked abandoned:', res1.rowCount);

    // 2) Send reminders (optional) - just log placeholders if disabled
    if (!isRemindersEnabled()) {
      console.log('[worker] reminders disabled');
    } else {
      // Expiring soon (in next 5 minutes), not yet sent
      const res2 = await client.query(`
        SELECT id, email, resume_token FROM checkout_sessions
        WHERE status = 'pix_generated' AND email IS NOT NULL AND pix_expires_at > NOW() AND pix_expires_at <= NOW() + INTERVAL '5 minutes'
          AND (reminder_expiring_sent_at IS NULL)
        LIMIT 100
      `);
      for (const row of res2.rows) {
        // TODO: integrate with your sendEmail(); here we only stamp the time
        await client.query('UPDATE checkout_sessions SET reminder_expiring_sent_at = NOW() WHERE id = $1', [row.id]);
        console.log('[worker] expiring reminder stamped for', row.id);
      }

      // Expired (past), not yet sent expired reminder
      const res3 = await client.query(`
        SELECT id, email, resume_token FROM checkout_sessions
        WHERE status = 'abandoned' AND email IS NOT NULL AND (reminder_expired_sent_at IS NULL)
        LIMIT 100
      `);
      for (const row of res3.rows) {
        await client.query('UPDATE checkout_sessions SET reminder_expired_sent_at = NOW() WHERE id = $1', [row.id]);
        console.log('[worker] expired reminder stamped for', row.id);
      }
    }
  } catch (e) {
    console.error('[worker] error:', e && e.message ? e.message : e);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

run().catch((e) => { console.error('[worker] unhandled', e); process.exitCode = 1; });
