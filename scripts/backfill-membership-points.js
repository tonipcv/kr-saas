/*
  Backfill de membership points:
  - Garante PatientProfile para cada (doctorId, userId) presente em purchases
  - Preenche points_ledger.patient_profile_id com base em sourceType='PURCHASE' -> purchases -> (doctorId,userId)
  - Recalcula patient_profiles.total_points e current_points a partir do ledger por perfil

  Uso: node scripts/backfill-membership-points.js
*/
const { Client } = require('pg');
require('dotenv').config();

function envOrThrow(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

const SQL = `
-- 0) Extensão
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Garante PatientProfile para pares (doctorId, userId) com compras
--    Usa upsert via INSERT ON CONFLICT (doctor_id, user_id)
INSERT INTO patient_profiles (id, doctor_id, user_id, is_active, created_at, updated_at)
SELECT gen_random_uuid()::text, p."doctorId", p."userId", true, now(), now()
FROM purchases p
LEFT JOIN patient_profiles pp
  ON pp.doctor_id = p."doctorId" AND pp.user_id = p."userId"
WHERE pp.id IS NULL
GROUP BY p."doctorId", p."userId";

-- 2) Preenche points_ledger.patient_profile_id para entries de PURCHASE
--    Faz join em purchases -> patient_profiles
WITH j AS (
  SELECT pl.id AS ledger_id, pp.id AS profile_id
  FROM points_ledger pl
  JOIN purchases pur ON pur.id = pl."sourceId" AND pl."sourceType" = 'PURCHASE'
  JOIN patient_profiles pp ON pp.doctor_id = pur."doctorId" AND pp.user_id = pur."userId"
  WHERE pl.patient_profile_id IS NULL
)
UPDATE points_ledger pl
SET patient_profile_id = j.profile_id
FROM j
WHERE pl.id = j.ledger_id;

-- 3) Recalcula snapshots a partir do ledger
--    total_points = soma de amounts positivos
--    current_points = soma de todos amounts (pos/neg)
WITH agg AS (
  SELECT
    pl.patient_profile_id AS profile_id,
    COALESCE(SUM(CASE WHEN pl.amount > 0 THEN pl.amount ELSE 0 END), 0) AS total_points_dec,
    COALESCE(SUM(pl.amount), 0) AS current_points_dec
  FROM points_ledger pl
  WHERE pl.patient_profile_id IS NOT NULL
  GROUP BY pl.patient_profile_id
)
UPDATE patient_profiles pp SET
  total_points = FLOOR(a.total_points_dec)::int,
  current_points = FLOOR(a.current_points_dec)::int,
  updated_at = now()
FROM agg a
WHERE pp.id = a.profile_id;
`;

async function run() {
  const client = new Client({ connectionString: envOrThrow('DATABASE_URL') });
  await client.connect();
  try {
    console.log('Running backfill for membership points...');
    await client.query('BEGIN');
    await client.query(SQL);
    await client.query('COMMIT');
    console.log('Backfill completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Backfill failed:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

run();
