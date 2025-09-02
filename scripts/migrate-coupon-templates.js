/*
 Idempotent migration for coupon_templates and template_id on coupons.
 Uses DATABASE_URL from environment.
*/

const { Client } = require('pg');
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
    console.log('Starting coupon_templates migration...');

    await client.query(`
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
    `);

    // Add columns to coupons
    await client.query(`
      ALTER TABLE coupons
        ADD COLUMN IF NOT EXISTS template_id text;
    `);

    // Unique constraint per doctor/slug for templates
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_coupon_templates_doctor_slug
      ON coupon_templates(doctor_id, slug);
    `);

    // Helpful indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_coupon_templates_doctor_id ON coupon_templates(doctor_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_coupon_templates_slug ON coupon_templates(slug);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_coupons_template_id ON coupons(template_id);`);

    // FKs (attempt, ignore if exist)
    const fks = [
      `ALTER TABLE coupon_templates ADD CONSTRAINT fk_coupon_templates_doctor_id_user FOREIGN KEY (doctor_id) REFERENCES "User"(id) ON DELETE CASCADE;`,
      `ALTER TABLE coupons ADD CONSTRAINT fk_coupons_template_id FOREIGN KEY (template_id) REFERENCES coupon_templates(id) ON DELETE SET NULL;`,
    ];
    for (const fk of fks) {
      try {
        await client.query(fk);
      } catch (e) {
        console.log('Skipping FK creation:', e.message);
      }
    }

    // updated_at trigger on coupon_templates
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
          SELECT 1 FROM pg_trigger WHERE tgname = 'trg_coupon_templates_set_updated_at'
        ) THEN
          CREATE TRIGGER trg_coupon_templates_set_updated_at
          BEFORE UPDATE ON coupon_templates
          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
        END IF;
      END $$;
    `);

    console.log('coupon_templates migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    throw err;
  } finally {
    await client.end();
  }
}

run();
