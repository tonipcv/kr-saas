/**
 * Script to add product categories and update products table using direct SQL with SQLite
 * 
 * This script:
 * 1. Creates a product_categories table
 * 2. Adds subtitle field to products table (if not already added)
 * 3. Adds categoryId field to products table (if not already added)
 * 4. Creates default categories for each doctor
 * 5. Assigns products to appropriate categories
 */

const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const path = require('path');

// Path to the SQLite database
const DB_PATH = path.join(__dirname, '../prisma/dev.db');

// Generate a CUID-like ID (simplified version)
function generateId() {
  return 'c' + crypto.randomBytes(8).toString('hex');
}

// Helper function to run SQL queries
function runQuery(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

// Helper function to get all rows
function getAllRows(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// SQL statements
const CREATE_CATEGORY_TABLE = `
CREATE TABLE IF NOT EXISTS product_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  doctorId TEXT,
  isActive INTEGER DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS product_categories_doctor_name_idx ON product_categories (doctorId, name);
CREATE INDEX IF NOT EXISTS product_categories_doctor_idx ON product_categories (doctorId);
`;

const ALTER_PRODUCTS_TABLE_SUBTITLE = `
ALTER TABLE products ADD COLUMN subtitle TEXT;
`;

const ALTER_PRODUCTS_TABLE_CATEGORY_ID = `
ALTER TABLE products ADD COLUMN categoryId TEXT;
`;

const CREATE_CATEGORY_ID_INDEX = `
CREATE INDEX IF NOT EXISTS products_category_id_idx ON products (categoryId);
`;

async function main() {
  // Open database connection
  const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
      console.error('Error opening database:', err.message);
      process.exit(1);
    }
    console.log('Connected to the SQLite database.');
  });

  try {
    console.log('Starting product categories migration...');
    
    // Step 1: Create the product_categories table
    console.log('Creating product_categories table...');
    await runQuery(db, CREATE_CATEGORY_TABLE);
    console.log('Product categories table created successfully.');
    
    // Step 2: Alter products table to add subtitle
    console.log('Altering products table to add subtitle...');
    try {
      await runQuery(db, ALTER_PRODUCTS_TABLE_SUBTITLE);
      console.log('Added subtitle column to products table.');
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        console.log('Subtitle column already exists, skipping...');
      } else {
        throw error;
      }
    }
    
    // Step 3: Alter products table to add categoryId
    console.log('Altering products table to add categoryId...');
    try {
      await runQuery(db, ALTER_PRODUCTS_TABLE_CATEGORY_ID);
      console.log('Added categoryId column to products table.');
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        console.log('CategoryId column already exists, skipping...');
      } else {
        throw error;
      }
    }
    
    // Create index on categoryId
    await runQuery(db, CREATE_CATEGORY_ID_INDEX);
    console.log('Created index on categoryId column.');
    
    // Step 4: Create default categories based on product types
    console.log('Creating default product categories...');
    
    // Define default categories
    const defaultCategories = [
      { name: 'Consultas', slug: 'consultas' },
      { name: 'Exames', slug: 'exames' },
      { name: 'Procedimentos', slug: 'procedimentos' },
      { name: 'Suplementos', slug: 'suplementos' },
      { name: 'Cursos', slug: 'cursos' },
      { name: 'Outros', slug: 'outros' }
    ];
    
    // Get all doctors with products
    const doctors = await getAllRows(db, `
      SELECT DISTINCT doctorId 
      FROM products 
      WHERE doctorId IS NOT NULL
      ORDER BY doctorId
    `);
    
    console.log(`Found ${uniqueCategories.length} unique categories to migrate.`);
    
    // Step 5: Create categories
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
      
      // Check if category already exists
      const existingCategory = await getAllRows(db, `
        SELECT id FROM product_categories 
        WHERE name = ? AND (doctorId = ? OR (? IS NULL AND doctorId IS NULL))
      `, [categoryName, doctorId, doctorId]);
      
      if (existingCategory.length === 0) {
        // Create the category
        await runQuery(db, `
          INSERT INTO product_categories (id, name, slug, doctorId, isActive, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `, [categoryId, categoryName, slug, doctorId]);
        
        // Store mapping of doctorId+category to categoryId
        const key = `${doctorId || 'null'}_${categoryName}`;
        categoryMap.set(key, categoryId);
        
        console.log(`Created category: ${categoryName} (${categoryId}) for doctor: ${doctorId || 'global'}`);
      } else {
        const existingCategoryId = existingCategory[0].id;
        const key = `${doctorId || 'null'}_${categoryName}`;
        categoryMap.set(key, existingCategoryId);
        console.log(`Category already exists: ${categoryName} (${existingCategoryId}) for doctor: ${doctorId || 'global'}`);
      }
    }
    
    // Step 6: Update products to reference the new categories
    console.log('Updating products to reference new categories...');
    
    // For each unique category, update all products with that category
    for (const cat of uniqueCategories) {
      const doctorId = cat.doctorId;
      const categoryName = cat.category;
      const key = `${doctorId || 'null'}_${categoryName}`;
      const categoryId = categoryMap.get(key);
      
      if (categoryId) {
        const result = await runQuery(db, `
          UPDATE products 
          SET categoryId = ? 
          WHERE category = ? AND (doctorId = ? OR (? IS NULL AND doctorId IS NULL))
        `, [categoryId, categoryName, doctorId, doctorId]);
        
        console.log(`Updated ${result.changes} products with category: ${categoryName}`);
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
    // Close the database connection
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message);
      } else {
        console.log('Closed the database connection.');
      }
    });
  }
}

// Check if sqlite3 package is installed
try {
  require.resolve('sqlite3');
  
  // Run the migration
  main()
    .catch(e => {
      console.error(e);
      process.exit(1);
    });
} catch (e) {
  console.error('The sqlite3 package is not installed. Please install it with:');
  console.error('npm install sqlite3');
  console.error('\nOr if you use yarn:');
  console.error('yarn add sqlite3');
  process.exit(1);
}
