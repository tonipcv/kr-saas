/*
  Migrates clinics table to support theming/branding.
  - Adds enum type "ClinicTheme" with values LIGHT, DARK (if not exists)
  - Adds columns: theme (ClinicTheme NOT NULL DEFAULT 'LIGHT'),
    button_color (text, nullable), button_text_color (text, nullable)
  - Backfills existing rows with defaults

  Run: node scripts/migrate-clinic-branding.js
*/

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrate() {
  console.log('🔄 Starting Clinic Branding migration...');
  try {
    // 1) Create enum type if not exists
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ClinicTheme') THEN
          CREATE TYPE "ClinicTheme" AS ENUM ('LIGHT', 'DARK');
        END IF;
      END
      $$;
    `);
    console.log('✅ Enum ClinicTheme ensured');

    // 2) Add columns if not exists
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'clinics' AND column_name = 'theme'
        ) THEN
          ALTER TABLE clinics ADD COLUMN theme "ClinicTheme" NOT NULL DEFAULT 'LIGHT';
        END IF;
      END
      $$;
    `);

    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'clinics' AND column_name = 'buttonColor'
        ) THEN
          ALTER TABLE clinics ADD COLUMN "buttonColor" text NULL;
        END IF;
      END
      $$;
    `);

    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'clinics' AND column_name = 'buttonTextColor'
        ) THEN
          ALTER TABLE clinics ADD COLUMN "buttonTextColor" text NULL;
        END IF;
      END
      $$;
    `);

    // 3) Backfill: ensure theme has a default where null (for safety)
    await prisma.$executeRawUnsafe(`
      UPDATE clinics SET theme = 'LIGHT'::"ClinicTheme" WHERE theme IS NULL;
    `);

    // 4) Report
    const rows = await prisma.$queryRaw`SELECT id, name, theme, "buttonColor", "buttonTextColor" FROM clinics LIMIT 5`;
    console.log('📌 Sample clinics after migration:', rows);

    console.log('✅ Clinic Branding migration completed');
  } catch (err) {
    console.error('❌ Migration error:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

migrate();
