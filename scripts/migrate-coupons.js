/*
 Idempotent migration for coupons and coupon_redemptions tables.
 Uses DATABASE_URL from environment.
*/

const { Client } = require('pg');
// Load env vars from .env at project root
require('dotenv').config();

function envOrThrow(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

async function run() {
  const client = new Client({ connectionString: envOrThrow('DATABASE_URL') });
  await client.connect();

  try {
    console.log('Starting coupons migration...');

    // Create tables if not exists
    const createTables = `
    CREATE TABLE IF NOT EXISTS coupons (
      id text PRIMARY KEY,
      code text NOT NULL,
      doctor_id text NOT NULL,
      campaign_id text,
      patient_id text,
      referrer_id text,
      product_id text,
      objective text,
      objective_meta jsonb,
      display_title text,
      display_message text,
      status text NOT NULL DEFAULT 'ISSUED',
      expires_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS coupon_redemptions (
      id text PRIMARY KEY,
      coupon_id text NOT NULL,
      doctor_id text NOT NULL,
      redeemed_by_id text,
      redeemed_at timestamptz NOT NULL DEFAULT now(),
      notes text
    );
    `;
    await client.query(createTables);

    // Ensure all columns exist (safe if table already existed with fewer columns)
    const addColumns = `
    ALTER TABLE coupons
      ADD COLUMN IF NOT EXISTS code text NOT NULL,
      ADD COLUMN IF NOT EXISTS doctor_id text NOT NULL,
      ADD COLUMN IF NOT EXISTS campaign_id text,
      ADD COLUMN IF NOT EXISTS patient_id text,
      ADD COLUMN IF NOT EXISTS referrer_id text,
      ADD COLUMN IF NOT EXISTS product_id text,
      ADD COLUMN IF NOT EXISTS objective text,
      ADD COLUMN IF NOT EXISTS objective_meta jsonb,
      ADD COLUMN IF NOT EXISTS display_title text,
      ADD COLUMN IF NOT EXISTS display_message text,
      ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ISSUED',
      ADD COLUMN IF NOT EXISTS expires_at timestamptz,
      ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

    ALTER TABLE coupon_redemptions
      ADD COLUMN IF NOT EXISTS coupon_id text NOT NULL,
      ADD COLUMN IF NOT EXISTS doctor_id text NOT NULL,
      ADD COLUMN IF NOT EXISTS redeemed_by_id text,
      ADD COLUMN IF NOT EXISTS redeemed_at timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS notes text;
    `;
    await client.query(addColumns);

    // Unique constraint (via unique index) for one coupon per patient per objective per doctor
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_coupons_unique_doctor_patient_objective
      ON coupons (doctor_id, patient_id, objective);
    `);

    // Regular indexes used by queries
    await client.query(`CREATE INDEX IF NOT EXISTS idx_coupons_doctor_id ON coupons(doctor_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_coupons_campaign_id ON coupons(campaign_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_coupons_patient_id ON coupons(patient_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_coupons_referrer_id ON coupons(referrer_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_coupons_product_id ON coupons(product_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_coupons_status ON coupons(status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_coupons_created_at ON coupons(created_at);`);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon_id ON coupon_redemptions(coupon_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_doctor_id ON coupon_redemptions(doctor_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_redeemed_at ON coupon_redemptions(redeemed_at);`);

    // Foreign keys: try each independently; if it fails (e.g., missing PK/unique on referenced column), log and continue
    const fkStatements = [
      `ALTER TABLE coupons ADD CONSTRAINT fk_coupons_doctor_id_user FOREIGN KEY (doctor_id) REFERENCES "User"(id) ON DELETE CASCADE;`,
      `ALTER TABLE coupons ADD CONSTRAINT fk_coupons_patient_id_user FOREIGN KEY (patient_id) REFERENCES "User"(id) ON DELETE SET NULL;`,
      `ALTER TABLE coupons ADD CONSTRAINT fk_coupons_referrer_id_user FOREIGN KEY (referrer_id) REFERENCES "User"(id) ON DELETE SET NULL;`,
      `ALTER TABLE coupons ADD CONSTRAINT fk_coupons_product_id_products FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;`,
      `ALTER TABLE coupon_redemptions ADD CONSTRAINT fk_coupon_redemptions_coupon_id FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE;`,
      `ALTER TABLE coupon_redemptions ADD CONSTRAINT fk_coupon_redemptions_doctor_id_user FOREIGN KEY (doctor_id) REFERENCES "User"(id) ON DELETE CASCADE;`,
      `ALTER TABLE coupon_redemptions ADD CONSTRAINT fk_coupon_redemptions_redeemed_by_user FOREIGN KEY (redeemed_by_id) REFERENCES "User"(id) ON DELETE SET NULL;`,
    ];

    for (const stmt of fkStatements) {
      try {
        await client.query(stmt);
      } catch (e) {
        // Ignore if constraint exists or referenced column not unique; continue
        console.log(`Skipping FK creation: ${e.message}`);
      }
    }

    // Touch updated_at trigger/column simulation to keep parity with Prisma @updatedAt behavior
    await client.query(`
      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger WHERE tgname = 'trg_coupons_set_updated_at'
        ) THEN
          CREATE TRIGGER trg_coupons_set_updated_at
          BEFORE UPDATE ON coupons
          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
        END IF;
      END $$;
    `);

    console.log('Coupons migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    throw err;
  } finally {
    await client.end();
  }
}

run();
