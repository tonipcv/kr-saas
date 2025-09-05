/*
  Migração de pontos/membership (DDL + seed) usando DATABASE_URL do .env.
  Uso: node scripts/migrate-membership-points.js
*/
const { Client } = require('pg');
require('dotenv').config();

function envOrThrow(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

const SQL = `
-- Ensure pgcrypto for gen_random_uuid
CREATE EXTENSION IF NOT EXISTS pgcrypto;

BEGIN;

-- 1) Tabela global de níveis de membership
CREATE TABLE IF NOT EXISTS membership_levels (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text UNIQUE,
  min_points integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Colunas no patient_profiles para snapshots e FK do nível
ALTER TABLE patient_profiles
  ADD COLUMN IF NOT EXISTS total_points integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_points integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS membership_level_id text;

CREATE INDEX IF NOT EXISTS idx_patient_profiles_membership_level_id
  ON patient_profiles(membership_level_id);

-- 3) Coluna no points_ledger para escopo por perfil do paciente (tenant)
ALTER TABLE points_ledger
  ADD COLUMN IF NOT EXISTS patient_profile_id text;

CREATE INDEX IF NOT EXISTS idx_points_ledger_patient_profile_id
  ON points_ledger(patient_profile_id);

-- 4) FKs (idempotentes)
DO $$
BEGIN
  ALTER TABLE patient_profiles
    ADD CONSTRAINT fk_patient_profiles_membership_level_id
    FOREIGN KEY (membership_level_id) REFERENCES membership_levels(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE points_ledger
    ADD CONSTRAINT fk_points_ledger_patient_profile_id
    FOREIGN KEY (patient_profile_id) REFERENCES patient_profiles(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- 5) Trigger de updated_at em membership_levels (reutiliza função se já existir)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_membership_levels_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_membership_levels_set_updated_at
    BEFORE UPDATE ON membership_levels
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

COMMIT;

-- 6) Seed de níveis Bronze/Prata/Ouro (idempotente via upsert por slug)
INSERT INTO membership_levels (id, name, slug, min_points, is_active)
VALUES (gen_random_uuid()::text, 'Bronze', 'bronze', 0, true)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      min_points = EXCLUDED.min_points,
      is_active = EXCLUDED.is_active,
      updated_at = now();

INSERT INTO membership_levels (id, name, slug, min_points, is_active)
VALUES (gen_random_uuid()::text, 'Prata', 'prata', 1000, true)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      min_points = EXCLUDED.min_points,
      is_active = EXCLUDED.is_active,
      updated_at = now();

INSERT INTO membership_levels (id, name, slug, min_points, is_active)
VALUES (gen_random_uuid()::text, 'Ouro', 'ouro', 5000, true)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      min_points = EXCLUDED.min_points,
      is_active = EXCLUDED.is_active,
      updated_at = now();
`;

async function run() {
  const client = new Client({ connectionString: envOrThrow('DATABASE_URL') });
  await client.connect();
  try {
    console.log('Running membership points migration (DDL + seed)...');
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
