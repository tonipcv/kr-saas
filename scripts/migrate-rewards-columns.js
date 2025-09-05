const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function backupRewards() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupTableName = `referral_rewards_backup_${timestamp}`;
  
  console.log(`Creating backup table: ${backupTableName}`);
  
  try {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE "${backupTableName}" AS SELECT * FROM "referral_rewards"`
    );
    
    console.log('Backup created successfully');
    return backupTableName;
  } catch (error) {
    console.error('Error creating backup:', error);
    throw error;
  }
}

async function addColumns() {
  try {
    // Check if columns exist
    const columns = await prisma.$queryRawUnsafe(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'referral_rewards' 
      AND column_name IN ('created_at', 'updated_at', 'image_url')`);

    const existingColumns = columns.map(c => c.column_name);
    console.log('Existing columns:', existingColumns);

    // Add created_at if it doesn't exist
    if (!existingColumns.includes('created_at')) {
      console.log('Adding created_at column...');
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "referral_rewards" 
        ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`);
    }

    // Add updated_at if it doesn't exist
    if (!existingColumns.includes('updated_at')) {
      console.log('Adding updated_at column...');
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "referral_rewards" 
        ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`);
    }

    // Add image_url if it doesn't exist
    if (!existingColumns.includes('image_url')) {
      console.log('Adding image_url column...');
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "referral_rewards" 
        ADD COLUMN IF NOT EXISTS "image_url" TEXT`);
    }

    // Rename existing columns if they exist with different names
    const allColumns = await prisma.$queryRawUnsafe(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'referral_rewards'`);
    
    const allColumnNames = allColumns.map(c => c.column_name);
    
    if (allColumnNames.includes('imageurl') && !allColumnNames.includes('image_url')) {
      console.log('Renaming imageurl to image_url...');
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "referral_rewards" 
        RENAME COLUMN "imageurl" TO "image_url"`);
    }

    if (allColumnNames.includes('createdat') && !allColumnNames.includes('created_at')) {
      console.log('Renaming createdat to created_at...');
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "referral_rewards" 
        RENAME COLUMN "createdat" TO "created_at"`);
    }

    if (allColumnNames.includes('updatedat') && !allColumnNames.includes('updated_at')) {
      console.log('Renaming updatedat to updated_at...');
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "referral_rewards" 
        RENAME COLUMN "updatedat" TO "updated_at"`);
    }

    console.log('Successfully added/renamed all required columns');
  } catch (error) {
    console.error('Error adding columns:', error);
    throw error;
  }
}

async function runMigration() {
  try {
    console.log('Starting migration process...');
    
    // Step 1: Create backup
    const backupTable = await backupRewards();
    console.log(`Backup created in table: ${backupTable}`);
    
    // Step 2: Add/rename columns
    await addColumns();
    
    console.log('\nMigration process completed successfully!');
    console.log(`Backup table ${backupTable} has been preserved for safety.`);
    
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
