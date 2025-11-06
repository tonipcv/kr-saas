// One-off runner: node tmp/run-open-finance-migration.js
const { Client } = require('pg');

const sql = `
BEGIN;

CREATE TABLE IF NOT EXISTS open_finance_links (
  id                    text PRIMARY KEY,
  user_id               text NOT NULL,
  clinic_id             text,
  organisation_id       text NOT NULL,
  authorisation_server_id text NOT NULL,
  enrollment_id         text NOT NULL,
  status                text NOT NULL DEFAULT 'PENDING',
  device_binding        jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ofl_user_id   ON open_finance_links (user_id);
CREATE INDEX IF NOT EXISTS idx_ofl_clinic_id ON open_finance_links (clinic_id);
CREATE INDEX IF NOT EXISTS idx_ofl_status    ON open_finance_links (status);

CREATE TABLE IF NOT EXISTS open_finance_consents (
  id                text PRIMARY KEY,
  link_id           text NOT NULL UNIQUE,
  consent_id        text NOT NULL,
  contract_id       text NOT NULL,
  status            text NOT NULL DEFAULT 'ACTIVE',
  amount_cents      integer NOT NULL,
  periodicity       text NOT NULL,
  next_execution_at timestamptz,
  metadata          jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_ofc_link FOREIGN KEY (link_id) REFERENCES open_finance_links (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ofc_status ON open_finance_consents (status);
CREATE INDEX IF NOT EXISTS idx_ofc_next   ON open_finance_consents (next_execution_at);

COMMIT;
`;

function sslFor(url) {
  return /amazonaws\.com|render\.com|supabase\.co|neon\.tech|herokuapp\.com/i.test(url)
    ? { rejectUnauthorized: false }
    : undefined;
}

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }
  const client = new Client({ connectionString: url, ssl: sslFor(url) });
  try {
    await client.connect();
    console.log('[migration] Running Open Finance tables migration...');
    await client.query(sql);
    console.log('[migration] Done.');
  } catch (err) {
    console.error('[migration] Failed:', err?.message || err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
