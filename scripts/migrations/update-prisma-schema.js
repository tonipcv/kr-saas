/**
 * Script to update the Prisma schema with Purchase and PointsLedger models
 * 
 * Run with: node scripts/migrations/update-prisma-schema.js
 */

const fs = require('fs');
const path = require('path');

const SCHEMA_PATH = path.join(__dirname, '../../prisma/schema.prisma');

async function main() {
  console.log('Updating Prisma schema with Purchase and PointsLedger models...');
  
  try {
    // Read the current schema
    let schemaContent = fs.readFileSync(SCHEMA_PATH, 'utf8');
    
    // Check if models already exist
    if (schemaContent.includes('model Purchase {') || schemaContent.includes('model PointsLedger {')) {
      console.log('Models already exist in schema. Skipping update.');
      return;
    }
    
    // Find the User model to add relations
    const userModelRegex = /model User {[\s\S]*?}/;
    const userModelMatch = schemaContent.match(userModelRegex);
    
    if (!userModelMatch) {
      console.error('Could not find User model in schema.');
      process.exit(1);
    }
    
    // Extract User model content
    const userModelContent = userModelMatch[0];
    
    // Add relations to User model
    const updatedUserModel = userModelContent.replace(
      /}$/,
      '  purchases      Purchase[]     @relation("UserPurchases")\n  doctorPurchases Purchase[]     @relation("DoctorPurchases")\n  pointsLedger   PointsLedger[] @relation("UserPointsLedger")\n}'
    );
    
    // Replace User model in schema
    schemaContent = schemaContent.replace(userModelRegex, updatedUserModel);
    
    // Add new models at the end of the file
    schemaContent += `
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
`;
    
    // Create a backup of the schema
    const backupPath = `${SCHEMA_PATH}.backup.${new Date().toISOString().replace(/[:.]/g, '_')}`;
    fs.writeFileSync(backupPath, schemaContent);
    console.log(`Created schema backup at: ${backupPath}`);
    
    // Write the updated schema
    fs.writeFileSync(SCHEMA_PATH, schemaContent);
    console.log('Schema updated successfully!');
    
    console.log('\nNext steps:');
    console.log('1. Review the updated schema.prisma file');
    console.log('2. Run: npx prisma generate');
    console.log('3. Run: node scripts/migrations/add-purchases-points.js');
    console.log('4. Restart your application');
    
  } catch (error) {
    console.error('Failed to update schema:', error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
