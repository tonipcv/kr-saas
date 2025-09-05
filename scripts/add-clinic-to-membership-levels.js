const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrateMembershipLevels() {
  try {
    // 1. Backup existing membership levels
    console.log('Backing up existing membership levels...');
    const existingLevels = await prisma.$queryRaw`
      SELECT DISTINCT ON (name) 
        name, 
        slug,
        min_points,
        is_active
      FROM membership_levels
      ORDER BY name, created_at DESC;
    `;
    console.log(`Found ${existingLevels.length} unique levels`);

    // 2. Execute SQL to modify the table structure (one command at a time)
    console.log('Modifying table structure...');
    
    // Add clinic_id column
    await prisma.$executeRaw`
      ALTER TABLE membership_levels 
      ADD COLUMN IF NOT EXISTS clinic_id text REFERENCES clinics(id) ON DELETE CASCADE;
    `;
    console.log('Added clinic_id column with foreign key');

    // Drop old unique constraint on slug if it exists
    try {
      await prisma.$executeRaw`
        ALTER TABLE membership_levels
        DROP CONSTRAINT IF EXISTS membership_levels_slug_key;
      `;
      console.log('Dropped old unique constraint');
    } catch (e) {
      console.log('No old unique constraint to drop');
    }

    // Add index on clinic_id
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_membership_levels_clinic_id
      ON membership_levels(clinic_id);
    `;
    console.log('Added index on clinic_id');

    // 3. Get all active clinics
    console.log('\nFinding active clinics...');
    const clinics = await prisma.clinic.findMany({
      where: { isActive: true },
      select: { id: true }
    });
    console.log(`Found ${clinics.length} active clinics`);

    // 4. For each clinic, create membership levels
    for (const clinic of clinics) {
      console.log(`\nProcessing clinic ${clinic.id}`);
      
      // First, check if clinic already has levels using raw query
      const existingClinicLevels = await prisma.$queryRaw`
        SELECT COUNT(*) as count 
        FROM membership_levels 
        WHERE clinic_id = ${clinic.id}
      `;

      if (existingClinicLevels[0].count > 0) {
        console.log(`Clinic ${clinic.id} already has ${existingClinicLevels[0].count} levels, skipping...`);
        continue;
      }
      
      for (const level of existingLevels) {
        try {
          // Use raw SQL to insert to handle the new structure
          await prisma.$executeRaw`
            INSERT INTO membership_levels (
              id,
              name,
              slug,
              min_points,
              is_active,
              clinic_id,
              created_at,
              updated_at
            ) VALUES (
              gen_random_uuid()::text,
              ${level.name},
              ${level.slug ? `${level.slug}-${clinic.id}` : null},
              ${level.min_points},
              ${level.is_active},
              ${clinic.id},
              now(),
              now()
            );
          `;
          
          console.log(`Created level ${level.name} for clinic ${clinic.id}`);
        } catch (e) {
          console.error(`Error creating level for clinic ${clinic.id}:`, e.message);
        }
      }
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
migrateMembershipLevels()
  .catch(console.error);