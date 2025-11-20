/**
 * Migration: Add unique constraint on (merchant_id, email) to customers table
 * Date: 2025-11-20
 * Purpose: Prevent duplicate customers per merchant+email combination
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('[migration] Starting: Add unique constraint customers(merchant_id, email)');

  try {
    // Step 1: Find and merge duplicate customers
    console.log('[migration] Step 1: Finding duplicate customers...');
    const duplicates = await prisma.$queryRaw`
      SELECT merchant_id, email, COUNT(*) as count, ARRAY_AGG(id ORDER BY created_at ASC) as ids
      FROM customers
      WHERE email IS NOT NULL AND merchant_id IS NOT NULL
      GROUP BY merchant_id, email
      HAVING COUNT(*) > 1
    `;

    if (duplicates && duplicates.length > 0) {
      console.log(`[migration] Found ${duplicates.length} duplicate email+merchant combinations`);
      
      for (const dup of duplicates) {
        const ids = dup.ids;
        const keepId = ids[0]; // Keep the oldest one
        const deleteIds = ids.slice(1); // Delete the rest
        
        console.log(`[migration] Merging duplicates for ${dup.email} (merchant: ${dup.merchant_id})`);
        console.log(`  - Keeping: ${keepId}`);
        console.log(`  - Deleting: ${deleteIds.join(', ')}`);

        // Update foreign key references to point to the kept customer
        for (const deleteId of deleteIds) {
          // Update CustomerProvider
          await prisma.$executeRaw`
            UPDATE customer_providers
            SET customer_id = ${keepId}
            WHERE customer_id = ${deleteId}
            AND NOT EXISTS (
              SELECT 1 FROM customer_providers 
              WHERE customer_id = ${keepId} 
              AND provider = customer_providers.provider 
              AND account_id = customer_providers.account_id
            )
          `;
          
          // Delete orphaned CustomerProvider records
          await prisma.$executeRaw`
            DELETE FROM customer_providers WHERE customer_id = ${deleteId}
          `;
          
          // Update CustomerPaymentMethod
          await prisma.$executeRaw`
            UPDATE customer_payment_methods
            SET customer_id = ${keepId}
            WHERE customer_id = ${deleteId}
          `;
          
          // Update CustomerSubscription
          await prisma.$executeRaw`
            UPDATE customer_subscriptions
            SET customer_id = ${keepId}
            WHERE customer_id = ${deleteId}
          `;
          
          // Update PaymentTransaction
          await prisma.$executeRaw`
            UPDATE payment_transactions
            SET customer_id = ${keepId}
            WHERE customer_id = ${deleteId}
          `;
          
          // Now safe to delete the duplicate customer
          await prisma.$executeRaw`
            DELETE FROM customers WHERE id = ${deleteId}
          `;
        }
        
        console.log(`  - Merged and deleted ${deleteIds.length} duplicate(s)`);
      }
    } else {
      console.log('[migration] No duplicates found');
    }

    // Step 2: Add unique constraint
    console.log('[migration] Step 2: Adding unique constraint...');
    await prisma.$executeRaw`
      ALTER TABLE customers
      ADD CONSTRAINT customers_merchant_id_email_key UNIQUE (merchant_id, email)
    `;
    console.log('[migration] ✅ Unique constraint added successfully');

  } catch (error) {
    if (error.message && error.message.includes('already exists')) {
      console.log('[migration] ⚠️  Constraint already exists, skipping');
    } else {
      console.error('[migration] ❌ Error:', error);
      throw error;
    }
  }

  console.log('[migration] Completed successfully');
}

main()
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
