const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function addClinicIdColumn() {
  try {
    // Check if column already exists
    const checkColumnExists = await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'products' 
      AND column_name = 'clinic_id'`;

    if (checkColumnExists.length === 0) {
      console.log('Adding clinic_id column to products table...');
      
      // Add the column
      await prisma.$executeRaw`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "clinic_id" TEXT`;
      
      // Add foreign key constraint
      await prisma.$executeRaw`
        ALTER TABLE "products" 
        ADD CONSTRAINT "products_clinic_id_fkey" 
        FOREIGN KEY ("clinic_id") 
        REFERENCES "clinics"("id") 
        ON DELETE SET NULL 
        ON UPDATE CASCADE`;
      
      // Create index
      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "products_clinic_id_idx" 
        ON "products"("clinic_id")`;

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
  const ownedClinics = await prisma.$queryRaw`
    SELECT c.id, c."name", c."isActive"
    FROM "clinics" c
    WHERE c."ownerId" = ${doctorId}
    AND c."isActive" = true
    LIMIT 1`;

  if (ownedClinics.length > 0) {
    return ownedClinics[0];
  }

  // If no owned clinic, find the first active clinic where they are a member
  const memberClinics = await prisma.$queryRaw`
    SELECT c.id, c."name", c."isActive"
    FROM "clinics" c
    JOIN "clinic_members" cm ON cm."clinicId" = c.id
    WHERE cm."userId" = ${doctorId}
    AND cm."isActive" = true
    AND c."isActive" = true
    LIMIT 1`;

  return memberClinics.length > 0 ? memberClinics[0] : null;
}

async function backupProducts() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupTableName = `products_backup_${timestamp}`;
  
  console.log(`Creating backup table: ${backupTableName}`);
  
  try {
    // Create backup table
    await prisma.$executeRaw`
      CREATE TABLE "${backupTableName}" AS 
      SELECT * FROM "products"`;
    
    console.log('Backup created successfully');
    return backupTableName;
  } catch (error) {
    console.error('Error creating backup:', error);
    throw error;
  }
}

async function migrateProductsData() {
  console.log('Starting products data migration...');
  
  try {
    // Get all products without a clinic_id
    const productsToMigrate = await prisma.$queryRaw`
      SELECT p.id, p."doctorId", p."name"
      FROM "products" p
      WHERE p."clinic_id" IS NULL
      AND p."doctorId" IS NOT NULL`;

    console.log(`Found ${productsToMigrate.length} products to migrate`);

    // Keep track of migration results
    const results = {
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    };

    // Process each product
    for (const product of productsToMigrate) {
      try {
        if (!product.doctorId) {
          console.log(`Skipping product ${product.id} - no doctor associated`);
          results.skipped++;
          continue;
        }

        const primaryClinic = await findDoctorPrimaryClinic(product.doctorId);

        if (!primaryClinic) {
          console.log(`No active clinic found for doctor ${product.doctorId} (product ${product.id})`);
          results.failed++;
          results.errors.push({
            productId: product.id,
            error: 'No active clinic found for doctor',
            doctorId: product.doctorId,
          });
          continue;
        }

        // Update the product with the clinic_id
        await prisma.$executeRaw`
          UPDATE "products"
          SET "clinic_id" = ${primaryClinic.id}
          WHERE id = ${product.id}`;

        console.log(`Successfully migrated product ${product.id} to clinic ${primaryClinic.id}`);
        results.success++;
      } catch (error) {
        console.error(`Error migrating product ${product.id}:`, error);
        results.failed++;
        results.errors.push({
          productId: product.id,
          error: error.message,
        });
      }
    }

    // Print final results
    console.log('\nMigration completed!');
    console.log('Results:', {
      total: productsToMigrate.length,
      successful: results.success,
      failed: results.failed,
      skipped: results.skipped,
    });

    if (results.errors.length > 0) {
      console.log('\nErrors encountered:');
      console.log(JSON.stringify(results.errors, null, 2));
    }

    // Verify the migration
    const remainingUnmigrated = await prisma.$queryRaw`
      SELECT COUNT(*)::int
      FROM "products"
      WHERE "clinic_id" IS NULL
      AND "doctorId" IS NOT NULL`;

    console.log(`\nVerification: ${remainingUnmigrated[0].count} products still without clinic_id`);

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
    const backupTable = await backupProducts();
    console.log(`Backup created in table: ${backupTable}`);
    
    // Step 2: Add clinic_id column and constraints
    await addClinicIdColumn();
    
    // Step 3: Migrate the data
    const results = await migrateProductsData();
    
    console.log('\nMigration process completed successfully!');
    console.log(`Backup table ${backupTable} has been preserved for safety.`);
    
    if (results.failed > 0) {
      console.log('\nWarning: Some products failed to migrate. Please review the errors above.');
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