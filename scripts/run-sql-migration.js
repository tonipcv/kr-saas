/*
  Node runner para executar a migração SQL (inline) usando DATABASE_URL do .env.
  Uso: node scripts/run-sql-migration.js
*/
const { Client } = require('pg');
require('dotenv').config();

function envOrThrow(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

const SQL = `
BEGIN;

-- Tabela de templates
CREATE TABLE IF NOT EXISTS coupon_templates (
  id text PRIMARY KEY,
  doctor_id text NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  display_title text,
  display_message text,
  config jsonb DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Coluna de FK no coupons
ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS template_id text;

-- Índices
CREATE UNIQUE INDEX IF NOT EXISTS idx_coupon_templates_doctor_slug
  ON coupon_templates(doctor_id, slug);

CREATE INDEX IF NOT EXISTS idx_coupon_templates_doctor_id
  ON coupon_templates(doctor_id);

CREATE INDEX IF NOT EXISTS idx_coupon_templates_slug
  ON coupon_templates(slug);

CREATE INDEX IF NOT EXISTS idx_coupons_template_id
  ON coupons(template_id);

-- Função para updated_at (idempotente)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger em coupon_templates (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_coupon_templates_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_coupon_templates_set_updated_at
    BEFORE UPDATE ON coupon_templates
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- FK de coupons.template_id -> coupon_templates.id (idempotente)
DO $$
BEGIN
  ALTER TABLE coupons
  ADD CONSTRAINT fk_coupons_template_id
  FOREIGN KEY (template_id) REFERENCES coupon_templates(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

COMMIT;
`;

async function run() {
  const client = new Client({ connectionString: envOrThrow('DATABASE_URL') });
  await client.connect();
  try {
    console.log('Running inline SQL migration for coupon_templates ...');
    await client.query(SQL);
    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

run();
