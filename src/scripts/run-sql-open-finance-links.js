// Usage: node src/scripts/run-sql-open-finance-links.js
// Requires: npm i pg

const { Client } = require('pg');

// Fallback DB URL (will be overridden by process.env.DATABASE_URL if set)
const DATABASE_URL_FALLBACK = "postgres://postgres:29d4a95271ee6931b67e@dpbdp1.easypanel.host:6545/aa?sslmode=disable";

const SQL = `
CREATE TABLE IF NOT EXISTS open_finance_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  clinic_id TEXT NULL,
  organisation_id TEXT NOT NULL,
  authorisation_server_id TEXT NOT NULL,
  enrollment_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'PENDING',
  device_binding JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_open_finance_links_updated_at ON open_finance_links;
CREATE TRIGGER trg_open_finance_links_updated_at
BEFORE UPDATE ON open_finance_links
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_open_finance_links_user_id ON open_finance_links (user_id);
CREATE INDEX IF NOT EXISTS idx_open_finance_links_status ON open_finance_links (status);
`;

async function main() {
  const databaseUrl = process.env.DATABASE_URL || DATABASE_URL_FALLBACK;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set and no fallback provided.');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    await client.query('BEGIN');
    await client.query(SQL);
    await client.query('COMMIT');
    console.log('open_finance_links table created/updated successfully.');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Failed to run SQL:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
