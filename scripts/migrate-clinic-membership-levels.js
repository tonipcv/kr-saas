const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrateMembershipLevels() {
  try {
    // Get all clinics
    const clinics = await prisma.clinic.findMany({
      where: { isActive: true },
      select: { id: true }
    });

    // Get existing global membership levels
    const existingLevels = await prisma.membershipLevel.findMany({
      where: { isActive: true },
      orderBy: { minPoints: 'asc' }
    });

    console.log(`Found ${clinics.length} clinics and ${existingLevels.length} existing levels`);

    // For each clinic, create clinic-specific membership levels
    for (const clinic of clinics) {
      console.log(`\nProcessing clinic ${clinic.id}`);
      
      for (const level of existingLevels) {
        const { id, createdAt, updatedAt, ...levelData } = level;
        
        await prisma.membershipLevel.create({
          data: {
            ...levelData,
            clinicId: clinic.id,
            // Make slug unique per clinic by appending clinic ID
            slug: `${levelData.slug}-${clinic.id}`
          }
        });
        
        console.log(`Created level ${levelData.name} for clinic ${clinic.id}`);
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
