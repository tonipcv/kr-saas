/**
 * Script to add product categories and update products table using direct SQL
 * 
 * This script:
 * 1. Creates a product_categories table
 * 2. Adds subtitle field to products table
 * 3. Adds categoryId field to products table
 * 4. Backfills product_categories from existing product categories
 * 5. Updates products to reference the new categories
 */

const { Pool } = require('pg');
const readline = require('readline');
const crypto = require('crypto');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Database connection from environment variable
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Generate a CUID-like ID (simplified version)
function generateId() {
  return 'c' + crypto.randomBytes(8).toString('hex');
}

// SQL statements
const CREATE_CATEGORY_TABLE = `
CREATE TABLE IF NOT EXISTS product_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  "doctorId" TEXT,
  "isActive" BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS product_categories_doctor_name_idx ON product_categories ("doctorId", name);
CREATE INDEX IF NOT EXISTS product_categories_doctor_idx ON product_categories ("doctorId");
`;

const ALTER_PRODUCTS_TABLE = `
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS subtitle TEXT,
ADD COLUMN IF NOT EXISTS "categoryId" TEXT;

CREATE INDEX IF NOT EXISTS products_category_id_idx ON products ("categoryId");
`;

async function main() {
  try {
    console.log('Starting product categories migration...');
    
    // Step 1: Create the product_categories table
    console.log('Creating product_categories table...');
    await pool.query(CREATE_CATEGORY_TABLE);
    console.log('Product categories table created successfully.');
    
    // Step 2: Alter products table to add subtitle and categoryId
    console.log('Altering products table to add subtitle and categoryId...');
    await pool.query(ALTER_PRODUCTS_TABLE);
    console.log('Products table altered successfully.');
    
    // Step 3: Get all unique doctor/category combinations
    console.log('Analyzing existing product categories...');
    const uniqueCategoriesResult = await pool.query(`
      SELECT DISTINCT "doctorId", category 
      FROM products 
      WHERE category IS NOT NULL AND category != ''
      ORDER BY "doctorId", category
    `);
    
    const uniqueCategories = uniqueCategoriesResult.rows;
    console.log(`Found ${uniqueCategories.length} unique categories to migrate.`);
    
    // Step 4: Create categories
    console.log('Creating product categories...');
    const categoryMap = new Map(); // To store category name -> id mapping
    
    for (const cat of uniqueCategories) {
      const doctorId = cat.doctorId;
      const categoryName = cat.category;
      
      // Generate a slug from the category name
      const slug = categoryName
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, '-') + 
        '-' + Math.floor(Math.random() * 1000); // Add random suffix to ensure uniqueness
      
      // Generate a unique ID
      const categoryId = generateId();
      
      // Create the category
      await pool.query(`
        INSERT INTO product_categories (id, name, slug, "doctorId", "isActive", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, true, NOW(), NOW())
        ON CONFLICT ("doctorId", name) DO NOTHING
      `, [categoryId, categoryName, slug, doctorId]);
      
      // Store mapping of doctorId+category to categoryId
      const key = `${doctorId || 'null'}_${categoryName}`;
      categoryMap.set(key, categoryId);
      
      console.log(`Created category: ${categoryName} (${categoryId}) for doctor: ${doctorId || 'global'}`);
    }
    
    // Step 5: Update products to reference the new categories
    console.log('Updating products to reference new categories...');
    
    // For each unique category, update all products with that category
    for (const cat of uniqueCategories) {
      const doctorId = cat.doctorId;
      const categoryName = cat.category;
      const key = `${doctorId || 'null'}_${categoryName}`;
      const categoryId = categoryMap.get(key);
      
      if (categoryId) {
        const updateResult = await pool.query(`
          UPDATE products 
          SET "categoryId" = $1 
          WHERE category = $2 AND ("doctorId" = $3 OR ($3 IS NULL AND "doctorId" IS NULL))
        `, [categoryId, categoryName, doctorId]);
        
        console.log(`Updated ${updateResult.rowCount} products with category: ${categoryName}`);
      }
    }
    
    console.log(`\nMigration completed successfully!`);
    console.log(`Created ${uniqueCategories.length} product categories.`);
    
    console.log('\nNext steps:');
    console.log('1. Update your Prisma schema to match the database changes');
    console.log('2. Update your code to use product.productCategory.name instead of product.category');
    console.log('3. After verifying everything works, you can remove the category field from the products table');
    
  } catch (error) {
    console.error('Error during migration:', error);
  } finally {
    await pool.end();
    rl.close();
  }
}

// Check if pg package is installed
try {
  require.resolve('pg');
  
  // Check if DATABASE_URL is set
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL environment variable is not set.');
    console.error('Please set it before running this script:');
    console.error('export DATABASE_URL="postgresql://username:password@localhost:5432/database"');
    process.exit(1);
  }
  
  // Run the migration
  main()
    .catch(e => {
      console.error(e);
      process.exit(1);
    });
} catch (e) {
  console.error('The pg package is not installed. Please install it with:');
  console.error('npm install pg');
  console.error('\nOr if you use yarn:');
  console.error('yarn add pg');
  process.exit(1);
}
