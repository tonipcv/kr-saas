/**
 * Direct SQL migration script for product categories
 * 
 * This script:
 * 1. Creates the product_categories table
 * 2. Adds subtitle and categoryId fields to products table
 * 3. Creates default categories for each doctor
 * 4. Assigns products to categories based on name patterns
 */

const { Pool } = require('pg');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

// Generate a CUID-like ID (simplified version)
function generateId() {
  return 'c' + crypto.randomBytes(8).toString('hex');
}

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// SQL statements
const CREATE_CATEGORY_TABLE = `
CREATE TABLE IF NOT EXISTS product_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  "doctorId" TEXT REFERENCES "User"(id) ON DELETE CASCADE,
  "isActive" BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS product_categories_doctor_name_idx ON product_categories ("doctorId", name);
CREATE INDEX IF NOT EXISTS product_categories_doctor_idx ON product_categories ("doctorId");
`;

const CHECK_COLUMNS = `
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'products' 
AND column_name IN ('subtitle', 'categoryId');
`;

const ADD_SUBTITLE_COLUMN = `
ALTER TABLE products ADD COLUMN subtitle TEXT;
`;

const ADD_CATEGORY_ID_COLUMN = `
ALTER TABLE products ADD COLUMN "categoryId" TEXT REFERENCES product_categories(id);
`;

const CREATE_CATEGORY_ID_INDEX = `
CREATE INDEX IF NOT EXISTS products_category_id_idx ON products ("categoryId");
`;

const GET_DOCTORS = `
SELECT DISTINCT u.id, u.name
FROM "User" u
JOIN products p ON p."doctorId" = u.id
WHERE p."doctorId" IS NOT NULL;
`;

const CHECK_CATEGORY_EXISTS = `
SELECT id FROM product_categories 
WHERE name = $1 AND "doctorId" = $2;
`;

const CREATE_CATEGORY = `
INSERT INTO product_categories (id, name, slug, "doctorId", "isActive", "createdAt", "updatedAt")
VALUES ($1, $2, $3, $4, true, NOW(), NOW())
RETURNING id;
`;

const GET_PRODUCTS = `
SELECT id, name, "doctorId" 
FROM products 
WHERE "doctorId" IS NOT NULL;
`;

const UPDATE_PRODUCT_CATEGORY = `
UPDATE products 
SET "categoryId" = $1 
WHERE id = $2;
`;

async function main() {
  console.log('Starting product categories migration...');
  
  try {
    // Step 1: Create the product_categories table
    console.log('Creating product_categories table...');
    await pool.query(CREATE_CATEGORY_TABLE);
    console.log('Product categories table created successfully.');
    
    // Step 2: Check if subtitle and categoryId columns exist, add if not
    console.log('Checking if subtitle and categoryId columns exist in products table...');
    const columnCheck = await pool.query(CHECK_COLUMNS);
    
    const existingColumns = columnCheck.rows.map(row => row.column_name);
    const hasSubtitle = existingColumns.includes('subtitle');
    const hasCategoryId = existingColumns.includes('categoryid');
    
    if (!hasSubtitle) {
      console.log('Adding subtitle column to products table...');
      await pool.query(ADD_SUBTITLE_COLUMN);
      console.log('Added subtitle column to products table.');
    } else {
      console.log('Subtitle column already exists in products table.');
    }
    
    if (!hasCategoryId) {
      console.log('Adding categoryId column to products table...');
      await pool.query(ADD_CATEGORY_ID_COLUMN);
      console.log('Added categoryId column to products table.');
      
      // Create index on categoryId
      await pool.query(CREATE_CATEGORY_ID_INDEX);
      console.log('Created index on categoryId column.');
    } else {
      console.log('CategoryId column already exists in products table.');
    }
    
    // Step 3: Define default categories
    const defaultCategories = [
      { name: 'Consultas', slug: 'consultas' },
      { name: 'Exames', slug: 'exames' },
      { name: 'Procedimentos', slug: 'procedimentos' },
      { name: 'Suplementos', slug: 'suplementos' },
      { name: 'Cursos', slug: 'cursos' },
      { name: 'Outros', slug: 'outros' }
    ];
    
    // Step 4: Get all doctors with products
    console.log('Getting all doctors with products...');
    const doctorsResult = await pool.query(GET_DOCTORS);
    const doctors = doctorsResult.rows;
    
    console.log(`Found ${doctors.length} doctors with products.`);
    
    // Step 5: Create categories for each doctor
    console.log('Creating default categories for each doctor...');
    const categoryMap = new Map(); // Map to store doctorId_categoryName -> categoryId
    
    for (const doctor of doctors) {
      const doctorId = doctor.id;
      console.log(`Creating categories for doctor: ${doctorId} (${doctor.name || 'Unknown'})`);
      
      for (const category of defaultCategories) {
        // Check if category already exists for this doctor
        const existingCategoryResult = await pool.query(CHECK_CATEGORY_EXISTS, [category.name, doctorId]);
        
        let categoryId;
        
        if (existingCategoryResult.rows.length === 0) {
          // Create new category
          categoryId = generateId();
          const slug = `${category.slug}-${doctorId.substring(0, 6)}`;
          
          const result = await pool.query(CREATE_CATEGORY, [categoryId, category.name, slug, doctorId]);
          console.log(`Created category: ${category.name} (${categoryId}) for doctor: ${doctorId}`);
        } else {
          categoryId = existingCategoryResult.rows[0].id;
          console.log(`Category already exists: ${category.name} (${categoryId}) for doctor: ${doctorId}`);
        }
        
        // Store mapping
        const key = `${doctorId}_${category.name}`;
        categoryMap.set(key, categoryId);
      }
    }
    
    // Step 6: Assign products to categories based on name patterns
    console.log('Assigning products to categories...');
    const productsResult = await pool.query(GET_PRODUCTS);
    const products = productsResult.rows;
    
    console.log(`Found ${products.length} products to categorize.`);
    
    const categoryPatterns = {
      'Consultas': ['consult', 'atendimento', 'sessão', 'sessao', 'avaliação', 'avaliacao'],
      'Exames': ['exame', 'teste', 'análise', 'analise', 'diagnóstico', 'diagnostico'],
      'Procedimentos': ['procedimento', 'cirurgia', 'tratamento', 'terapia', 'aplicação', 'aplicacao'],
      'Suplementos': ['suplemento', 'vitamina', 'mineral', 'proteína', 'proteina', 'óleo', 'oleo', 'cápsula', 'capsula'],
      'Cursos': ['curso', 'workshop', 'treinamento', 'aula', 'palestra', 'mentoria'],
      'Outros': []  // Default category
    };
    
    let updatedCount = 0;
    
    for (const product of products) {
      const doctorId = product.doctorId;
      const productName = product.name.toLowerCase();
      
      // Determine category based on product name
      let assignedCategory = 'Outros';  // Default category
      
      for (const [category, patterns] of Object.entries(categoryPatterns)) {
        if (patterns.some(pattern => productName.includes(pattern.toLowerCase()))) {
          assignedCategory = category;
          break;
        }
      }
      
      // Get category ID
      const key = `${doctorId}_${assignedCategory}`;
      const categoryId = categoryMap.get(key);
      
      if (categoryId) {
        // Update product with category ID
        await pool.query(UPDATE_PRODUCT_CATEGORY, [categoryId, product.id]);
        updatedCount++;
        
        if (updatedCount % 10 === 0) {
          console.log(`Updated ${updatedCount} products so far...`);
        }
      }
    }
    
    console.log(`Updated ${updatedCount} products with category references.`);
    console.log(`\nMigration completed successfully!`);
    
    console.log('\nNext steps:');
    console.log('1. Run npx prisma generate to update the Prisma client');
    console.log('2. Update your code to use product.productCategory.name instead of product.category');
    
  } catch (error) {
    console.error('Error during migration:', error);
  } finally {
    await pool.end();
    console.log('Database connection closed.');
  }
}

// Check if required packages are installed
try {
  require.resolve('pg');
  require.resolve('dotenv');
  
  // Run the migration
  main()
    .catch(e => {
      console.error(e);
      process.exit(1);
    });
} catch (e) {
  console.error('Missing required packages. Please install them with:');
  console.error('npm install pg dotenv');
  console.error('\nOr if you use yarn:');
  console.error('yarn add pg dotenv');
  process.exit(1);
}
