const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function addClinicIdColumn() {
  try {
    // Check if column already exists
    const checkColumnExists = await prisma.$queryRawUnsafe(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'coupon_templates' 
      AND column_name = 'clinic_id'`);

    if (checkColumnExists.length === 0) {
      console.log('Adding clinic_id column to coupon_templates table...');
      
      // Add the column
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "coupon_templates" ADD COLUMN IF NOT EXISTS "clinic_id" TEXT`
      );
      
      // Add foreign key constraint
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "coupon_templates" 
        ADD CONSTRAINT "coupon_templates_clinic_id_fkey" 
        FOREIGN KEY ("clinic_id") 
        REFERENCES "clinics"("id") 
        ON DELETE SET NULL 
        ON UPDATE CASCADE`);
      
      // Create index
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "coupon_templates_clinic_id_idx" 
        ON "coupon_templates"("clinic_id")`);

      console.log('Successfully added clinic_id column and related constraints');
    } else {
      console.log('clinic_id column already exists, skipping schema modification');
    }
  } catch (error) {
    console.error('Error adding clinic_id column:', error);
    throw error;
  }
}

async function findDoctorPrimaryClinic(doctorId) {
  // First try to find a clinic where the doctor is an owner
  const ownedClinics = await prisma.$queryRawUnsafe(`
    SELECT c.id, c."name", c."isActive"
    FROM "clinics" c
    WHERE c."ownerId" = '${doctorId}'
    AND c."isActive" = true
    LIMIT 1`);

  if (ownedClinics.length > 0) {
    return ownedClinics[0];
  }

  // If no owned clinic, find the first active clinic where they are a member
  const memberClinics = await prisma.$queryRawUnsafe(`
    SELECT c.id, c."name", c."isActive"
    FROM "clinics" c
    JOIN "clinic_members" cm ON cm."clinicId" = c.id
    WHERE cm."userId" = '${doctorId}'
    AND cm."isActive" = true
    AND c."isActive" = true
    LIMIT 1`);

  return memberClinics.length > 0 ? memberClinics[0] : null;
}

async function backupCouponTemplates() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupTableName = `coupon_templates_backup_${timestamp}`;
  
  console.log(`Creating backup table: ${backupTableName}`);
  
  try {
    // Create backup table
    await prisma.$executeRawUnsafe(
      `CREATE TABLE "${backupTableName}" AS SELECT * FROM "coupon_templates"`
    );
    
    console.log('Backup created successfully');
    return backupTableName;
  } catch (error) {
    console.error('Error creating backup:', error);
    throw error;
  }
}

async function migrateCouponTemplatesData() {
  console.log('Starting coupon templates data migration...');
  
  try {
    // Get all coupon templates without a clinic_id
    const templatesToMigrate = await prisma.$queryRawUnsafe(`
      SELECT t.id, t."doctor_id"
      FROM "coupon_templates" t
      WHERE t."clinic_id" IS NULL
      AND t."doctor_id" IS NOT NULL`);

    console.log(`Found ${templatesToMigrate.length} coupon templates to migrate`);

    // Keep track of migration results
    const results = {
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    };

    // Process each template
    for (const template of templatesToMigrate) {
      try {
        if (!template.doctor_id) {
          console.log(`Skipping template ${template.id} - no doctor associated`);
          results.skipped++;
          continue;
        }

        const primaryClinic = await findDoctorPrimaryClinic(template.doctor_id);

        if (!primaryClinic) {
          console.log(`No active clinic found for doctor ${template.doctor_id} (template ${template.id})`);
          results.failed++;
          results.errors.push({
            templateId: template.id,
            error: 'No active clinic found for doctor',
            doctorId: template.doctor_id,
          });
          continue;
        }

        // Update the template with the clinic_id
        await prisma.$executeRawUnsafe(`
          UPDATE "coupon_templates"
          SET "clinic_id" = '${primaryClinic.id}'
          WHERE id = '${template.id}'`);

        console.log(`Successfully migrated template ${template.id} to clinic ${primaryClinic.id}`);
        results.success++;
      } catch (error) {
        console.error(`Error migrating template ${template.id}:`, error);
        results.failed++;
        results.errors.push({
          templateId: template.id,
          error: error.message,
        });
      }
    }

    // Print final results
    console.log('\nMigration completed!');
    console.log('Results:', {
      total: templatesToMigrate.length,
      successful: results.success,
      failed: results.failed,
      skipped: results.skipped,
    });

    if (results.errors.length > 0) {
      console.log('\nErrors encountered:');
      console.log(JSON.stringify(results.errors, null, 2));
    }

    // Verify the migration
    const remainingUnmigrated = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*)::int
      FROM "coupon_templates"
      WHERE "clinic_id" IS NULL
      AND "doctor_id" IS NOT NULL`);

    console.log(`\nVerification: ${remainingUnmigrated[0].count} templates still without clinic_id`);

    return results;
  } catch (error) {
    console.error('Fatal error during data migration:', error);
    throw error;
  }
}

async function runMigration() {
  try {
    console.log('Starting migration process...');
    
    // Step 1: Create backup
    const backupTable = await backupCouponTemplates();
    console.log(`Backup created in table: ${backupTable}`);
    
    // Step 2: Add clinic_id column and constraints
    await addClinicIdColumn();
    
    // Step 3: Migrate the data
    const results = await migrateCouponTemplatesData();
    
    console.log('\nMigration process completed successfully!');
    console.log(`Backup table ${backupTable} has been preserved for safety.`);
    
    if (results.failed > 0) {
      console.log('\nWarning: Some templates failed to migrate. Please review the errors above.');
      console.log('You can use the backup table to verify and fix any issues.');
    }
    
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
runMigration()
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
