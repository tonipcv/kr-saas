const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrateGlobalToTemplates() {
  try {
    // 1. Create templates table
    console.log('Creating templates table...');
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS membership_level_templates (
        id text PRIMARY KEY,
        name text NOT NULL,
        slug text UNIQUE,
        min_points integer NOT NULL DEFAULT 0,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `;

    // 2. Get all unique membership levels (ignoring clinic)
    console.log('Finding unique membership levels...');
    const uniqueLevels = await prisma.$queryRaw`
      SELECT DISTINCT ON (name) 
        name, 
        slug,
        min_points,
        is_active
      FROM membership_levels
      ORDER BY name, created_at DESC;
    `;
    console.log(`Found ${uniqueLevels.length} unique levels`);

    // 3. Insert them as templates
    console.log('\nCreating templates...');
    for (const level of uniqueLevels) {
      await prisma.$executeRaw`
        INSERT INTO membership_level_templates (
          id,
          name,
          slug,
          min_points,
          is_active,
          created_at,
          updated_at
        ) VALUES (
          gen_random_uuid()::text,
          ${level.name},
          ${level.slug ? level.slug.split('-')[0] : null}, -- Remove clinic ID suffix
          ${level.min_points},
          ${level.is_active},
          now(),
          now()
        )
        ON CONFLICT (slug) DO UPDATE SET
          name = EXCLUDED.name,
          min_points = EXCLUDED.min_points,
          is_active = EXCLUDED.is_active,
          updated_at = now();
      `;
      console.log(`Created/Updated template for ${level.name}`);
    }

    console.log('\nMigration completed successfully');
  } catch (error) {
    console.error('Error during migration:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
migrateGlobalToTemplates()
  .catch(console.error);
