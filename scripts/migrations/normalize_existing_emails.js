/**
 * Migration Script: Normalize existing emails in database
 * 
 * This script normalizes (lowercase + trim) all existing emails in:
 * - users table
 * - customers table
 * 
 * Run with: node scripts/migrations/normalize_existing_emails.js
 * 
 * IMPORTANT: This script is idempotent and safe to run multiple times
 */

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

function normalizeEmail(email) {
  if (!email) return null
  const normalized = String(email).trim().toLowerCase()
  return normalized === '' ? null : normalized
}

async function normalizeUsers() {
  console.log('\n📧 Normalizing User emails...')
  
  const users = await prisma.user.findMany({
    // User.email is non-nullable in schema (@unique, not optional),
    // so no need to filter by not null; fetch all users with email field
    select: { id: true, email: true }
  })
  
  console.log(`Found ${users.length} users with emails`)
  
  let updated = 0
  let skipped = 0
  let errors = 0
  
  for (const user of users) {
    const original = user.email
    const normalized = normalizeEmail(original)
    
    if (original === normalized) {
      skipped++
      continue
    }
    
    try {
      // Check if normalized email already exists
      const existing = await prisma.user.findUnique({
        where: { email: normalized },
        select: { id: true }
      })
      
      if (existing && existing.id !== user.id) {
        console.warn(`⚠️  Conflict: ${original} -> ${normalized} (already exists for user ${existing.id})`)
        errors++
        continue
      }
      
      await prisma.user.update({
        where: { id: user.id },
        data: { email: normalized }
      })
      
      console.log(`✅ Updated user ${user.id}: ${original} -> ${normalized}`)
      updated++
    } catch (e) {
      console.error(`❌ Error updating user ${user.id}:`, e.message)
      errors++
    }
  }
  
  console.log(`\n📊 Users Summary:`)
  console.log(`   - Updated: ${updated}`)
  console.log(`   - Skipped (already normalized): ${skipped}`)
  console.log(`   - Errors: ${errors}`)
}

async function normalizeCustomers() {
  console.log('\n📧 Normalizing Customer emails...')
  
  const customers = await prisma.customer.findMany({
    where: { email: { not: null } },
    select: { id: true, email: true, merchantId: true }
  })
  
  console.log(`Found ${customers.length} customers with emails`)
  
  let updated = 0
  let skipped = 0
  let errors = 0
  
  for (const customer of customers) {
    const original = customer.email
    const normalized = normalizeEmail(original)
    
    if (original === normalized) {
      skipped++
      continue
    }
    
    try {
      // Check if normalized email already exists for same merchant
      const existing = await prisma.customer.findFirst({
        where: { 
          merchantId: customer.merchantId,
          email: normalized 
        },
        select: { id: true }
      })
      
      if (existing && existing.id !== customer.id) {
        console.warn(`⚠️  Conflict: ${original} -> ${normalized} (already exists for merchant ${customer.merchantId}, customer ${existing.id})`)
        errors++
        continue
      }
      
      await prisma.customer.update({
        where: { id: customer.id },
        data: { email: normalized }
      })
      
      console.log(`✅ Updated customer ${customer.id}: ${original} -> ${normalized}`)
      updated++
    } catch (e) {
      console.error(`❌ Error updating customer ${customer.id}:`, e.message)
      errors++
    }
  }
  
  console.log(`\n📊 Customers Summary:`)
  console.log(`   - Updated: ${updated}`)
  console.log(`   - Skipped (already normalized): ${skipped}`)
  console.log(`   - Errors: ${errors}`)
}

async function main() {
  console.log('🚀 Starting email normalization migration...')
  console.log('This will normalize all emails to lowercase + trim')
  
  try {
    await normalizeUsers()
    await normalizeCustomers()
    
    console.log('\n✅ Migration completed successfully!')
  } catch (e) {
    console.error('\n❌ Migration failed:', e)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
