// Script to add imageUrl column to referral_rewards table
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function addImageUrlColumn() {
  try {
    console.log('Starting migration: Adding imageUrl column to referral_rewards table...');
    
    // Execute raw SQL to add the column if it doesn't exist
    await prisma.$executeRaw`
      ALTER TABLE "referral_rewards" 
      ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
    `;
    
    console.log('Migration successful: imageUrl column added to referral_rewards table');
    
    // Verify the column was added by querying the table info
    const tableInfo = await prisma.$queryRaw`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'referral_rewards' AND column_name = 'imageUrl';
    `;
    
    if (tableInfo.length > 0) {
      console.log('Verification successful: Column details:', tableInfo[0]);
    } else {
      console.log('Warning: Column verification failed. Please check the database manually.');
    }
    
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
addImageUrlColumn();
