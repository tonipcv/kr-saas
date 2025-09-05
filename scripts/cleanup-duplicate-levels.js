const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanupDuplicateLevels() {
  try {
    // Delete duplicate levels keeping only the most recent one for each name per clinic
    await prisma.$executeRaw`
      WITH duplicates AS (
        SELECT id,
        ROW_NUMBER() OVER (
          PARTITION BY clinic_id, name 
          ORDER BY created_at DESC
        ) as rn
        FROM membership_levels
      )
      DELETE FROM membership_levels
      WHERE id IN (
        SELECT id FROM duplicates WHERE rn > 1
      );
    `;

    console.log('Cleanup completed successfully');
  } catch (error) {
    console.error('Error during cleanup:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run cleanup
cleanupDuplicateLevels()
  .catch(console.error);
