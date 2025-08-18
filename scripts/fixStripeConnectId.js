const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Add missing stripe_connect_id column if it doesn't exist
  await prisma.$executeRaw`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "stripe_connect_id" TEXT;`;
  
  console.log('Successfully added stripe_connect_id column to User table');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
