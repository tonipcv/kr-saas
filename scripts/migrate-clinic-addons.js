const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createBackupTables() {
  // Create backup tables
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS clinic_add_ons_backup AS 
    SELECT * FROM "clinic_add_ons" WHERE 1=0;
    
    CREATE TABLE IF NOT EXISTS clinic_add_on_subscriptions_backup AS 
    SELECT * FROM "clinic_add_on_subscriptions" WHERE 1=0;
  `);
}

async function createClinicAddOnsTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "clinic_add_ons" (
      "id" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "quantity" INTEGER NOT NULL DEFAULT 1,
      "monthly_price" DECIMAL(10,2) NOT NULL,
      "is_active" BOOLEAN NOT NULL DEFAULT true,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT "clinic_add_ons_pkey" PRIMARY KEY ("id")
    );
  `);
}

async function createClinicAddOnSubscriptionsTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "clinic_add_on_subscriptions" (
      "id" TEXT NOT NULL,
      "subscription_id" TEXT NOT NULL,
      "add_on_id" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'ACTIVE',
      "quantity" INTEGER NOT NULL DEFAULT 1,
      "monthly_price" DECIMAL(10,2) NOT NULL,
      "start_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "end_date" TIMESTAMP(3),
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT "clinic_add_on_subscriptions_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "clinic_add_on_subscriptions_subscription_id_fkey" 
        FOREIGN KEY ("subscription_id") 
        REFERENCES "clinic_subscriptions"("id") 
        ON DELETE CASCADE,
      CONSTRAINT "clinic_add_on_subscriptions_add_on_id_fkey" 
        FOREIGN KEY ("add_on_id") 
        REFERENCES "clinic_add_ons"("id") 
        ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS "clinic_add_on_subscriptions_subscription_id_idx" 
      ON "clinic_add_on_subscriptions"("subscription_id");
    
    CREATE INDEX IF NOT EXISTS "clinic_add_on_subscriptions_add_on_id_idx" 
      ON "clinic_add_on_subscriptions"("add_on_id");
  `);
}

async function main() {
  try {
    console.log('Starting migration...');
    
    // Create backup tables
    console.log('Creating backup tables...');
    await createBackupTables();
    
    // Create clinic_add_ons table
    console.log('Creating clinic_add_ons table...');
    await createClinicAddOnsTable();
    
    // Create clinic_add_on_subscriptions table
    console.log('Creating clinic_add_on_subscriptions table...');
    await createClinicAddOnSubscriptionsTable();
    
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Error during migration:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
main();
