/**
 * Migration script to add purchases and points ledger tables
 * 
 * This script creates two new tables:
 * 1. purchases - to track product purchases by patients
 * 2. points_ledger - to track points earned from purchases
 * 
 * Run with: node scripts/migrations/add-purchases-points.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Starting migration: Adding purchases and points ledger tables...');
  
  try {
    // Create purchases table
    console.log('Creating purchases table...');
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "purchases" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "doctorId" TEXT NOT NULL,
      "productId" TEXT NOT NULL,
      "quantity" INTEGER NOT NULL DEFAULT 1,
      "unitPrice" DECIMAL(10,2) NOT NULL,
      "totalPrice" DECIMAL(10,2) NOT NULL,
      "pointsAwarded" DECIMAL(10,2) NOT NULL DEFAULT 0,
      "status" TEXT NOT NULL DEFAULT 'COMPLETED',
      "externalIdempotencyKey" TEXT,
      "notes" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
    );`);
    
    // Add indexes to purchases table - one by one
    console.log('Adding indexes to purchases table...');
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "purchases_userId_idx" ON "purchases"("userId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "purchases_doctorId_idx" ON "purchases"("doctorId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "purchases_productId_idx" ON "purchases"("productId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "purchases_status_idx" ON "purchases"("status");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "purchases_createdAt_idx" ON "purchases"("createdAt");`);
    
    // Add foreign keys to purchases table - one by one
    console.log('Adding foreign keys to purchases table...');
    await prisma.$executeRawUnsafe(`ALTER TABLE "purchases" ADD CONSTRAINT "purchases_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;`);
    
    await prisma.$executeRawUnsafe(`ALTER TABLE "purchases" ADD CONSTRAINT "purchases_doctorId_fkey"
      FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;`);
    
    await prisma.$executeRawUnsafe(`ALTER TABLE "purchases" ADD CONSTRAINT "purchases_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;`);
    
    // Create points_ledger table
    console.log('Creating points_ledger table...');
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "points_ledger" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "sourceType" TEXT NOT NULL,
      "sourceId" TEXT NOT NULL,
      "amount" DECIMAL(10,2) NOT NULL,
      "description" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "points_ledger_pkey" PRIMARY KEY ("id")
    );`);
    
    // Add indexes to points_ledger table - one by one
    console.log('Adding indexes to points_ledger table...');
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "points_ledger_userId_idx" ON "points_ledger"("userId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "points_ledger_sourceType_idx" ON "points_ledger"("sourceType");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "points_ledger_sourceId_idx" ON "points_ledger"("sourceId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "points_ledger_createdAt_idx" ON "points_ledger"("createdAt");`);
    
    // Add foreign key to points_ledger table
    console.log('Adding foreign key to points_ledger table...');
    await prisma.$executeRawUnsafe(`ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;`);
    
    console.log('Tables created successfully!');
    
    // Update Prisma schema (this is informational only - you'll need to manually update schema.prisma)
    console.log('\nMigration completed successfully!');
    console.log('\nIMPORTANT: Now you need to update your schema.prisma file with these models:');
    console.log(`
model Purchase {
  id                    String   @id @default(cuid())
  userId                String
  doctorId              String
  productId             String
  quantity              Int      @default(1)
  unitPrice             Decimal  @db.Decimal(10, 2)
  totalPrice            Decimal  @db.Decimal(10, 2)
  pointsAwarded         Decimal  @default(0) @db.Decimal(10, 2)
  status                String   @default("COMPLETED")
  externalIdempotencyKey String?
  notes                 String?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @default(now()) @updatedAt
  
  user                  User     @relation("UserPurchases", fields: [userId], references: [id], onDelete: Cascade)
  doctor                User     @relation("DoctorPurchases", fields: [doctorId], references: [id], onDelete: Cascade)
  product               products @relation(fields: [productId], references: [id], onDelete: Cascade)
  
  @@index([userId])
  @@index([doctorId])
  @@index([productId])
  @@index([status])
  @@index([createdAt])
  @@map("purchases")
}

model PointsLedger {
  id          String   @id @default(cuid())
  userId      String
  sourceType  String
  sourceId    String
  amount      Decimal  @db.Decimal(10, 2)
  description String?
  createdAt   DateTime @default(now())
  
  user        User     @relation("UserPointsLedger", fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([userId])
  @@index([sourceType])
  @@index([sourceId])
  @@index([createdAt])
  @@map("points_ledger")
}
    `);
    console.log('\nAlso add these relations to the User model:');
    console.log(`
  purchases      Purchase[]     @relation("UserPurchases")
  doctorPurchases Purchase[]     @relation("DoctorPurchases")
  pointsLedger   PointsLedger[] @relation("UserPointsLedger")
    `);
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    console.log('Migration completed successfully!');
    process.exit(0);
  })
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  });
