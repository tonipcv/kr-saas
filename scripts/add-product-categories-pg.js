/**
 * Script to add product categories and update products table using direct SQL with PostgreSQL
 * 
 * This script:
 * 1. Creates a product_categories table
 * 2. Adds subtitle field to products table (if not already added)
 * 3. Adds categoryId field to products table (if not already added)
 * 4. Creates default categories for each doctor
 * 5. Assigns products to appropriate categories
 */

const { Pool } = require('pg');
const crypto = require('crypto');

// Generate a CUID-like ID (simplified version)
function generateId() {
  return 'c' + crypto.randomBytes(8).toString('hex');
}

async function main() {
  // Check if DATABASE_URL is set
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL environment variable is not set.');
    console.error('Please set it before running this script:');
    console.error('export DATABASE_URL="postgresql://username:password@localhost:5432/database"');
    process.exit(1);
  }

  // PostgreSQL connection from environment variable
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  console.log('Connecting to PostgreSQL database...');
  
  try {
    console.log('Starting product categories migration...');
    
    // Step 1: Create the product_categories table
    console.log('Creating product_categories table...');
    await pool.query(`
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
    `);
    console.log('Product categories table created successfully.');
    
    // Step 2: Check if subtitle column exists, add if not
    console.log('Checking if subtitle column exists in products table...');
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'products' 
      AND column_name IN ('subtitle', 'categoryId');
    `);
    
    const existingColumns = columnCheck.rows.map(row => row.column_name);
    const hasSubtitle = existingColumns.includes('subtitle');
    const hasCategoryId = existingColumns.includes('categoryid');
    
    if (!hasSubtitle) {
      console.log('Adding subtitle column to products table...');
      await pool.query(`ALTER TABLE products ADD COLUMN subtitle TEXT;`);
      console.log('Added subtitle column to products table.');
    } else {
      console.log('Subtitle column already exists in products table.');
    }
    
    // Step 3: Check if categoryId column exists, add if not
    if (!hasCategoryId) {
      console.log('Adding categoryId column to products table...');
      await pool.query(`ALTER TABLE products ADD COLUMN "categoryId" TEXT;`);
      console.log('Added categoryId column to products table.');
      
      // Create index on categoryId
      await pool.query(`CREATE INDEX IF NOT EXISTS products_category_id_idx ON products ("categoryId");`);
      console.log('Created index on categoryId column.');
    } else {
      console.log('CategoryId column already exists in products table.');
    }
    
    // Step 4: Define default categories
    const defaultCategories = [
      { name: 'Consultas', slug: 'consultas' },
      { name: 'Exames', slug: 'exames' },
      { name: 'Procedimentos', slug: 'procedimentos' },
      { name: 'Suplementos', slug: 'suplementos' },
      { name: 'Cursos', slug: 'cursos' },
      { name: 'Outros', slug: 'outros' }
    ];
    
    // Step 5: Get all doctors with products
    console.log('Getting all doctors with products...');
    const doctorsResult = await pool.query(`
      SELECT DISTINCT "doctorId" 
      FROM products 
      WHERE "doctorId" IS NOT NULL
    `);
    
    const doctors = doctorsResult.rows;
    console.log(`Found ${doctors.length} doctors with products.`);
    
    // Step 6: Create categories for each doctor
    console.log('Creating default categories for each doctor...');
    const categoryMap = new Map(); // Map to store doctorId_categoryName -> categoryId
    
    for (const doctor of doctors) {
      const doctorId = doctor.doctorId;
      console.log(`Creating categories for doctor: ${doctorId}`);
      
      for (const category of defaultCategories) {
        // Check if category already exists for this doctor
        const existingCategoryResult = await pool.query(`
          SELECT id FROM product_categories 
          WHERE name = $1 AND "doctorId" = $2
        `, [category.name, doctorId]);
        
        let categoryId;
        
        if (existingCategoryResult.rows.length === 0) {
          // Create new category
          categoryId = generateId();
          const slug = `${category.slug}-${doctorId.substring(0, 6)}`;
          
          await pool.query(`
            INSERT INTO product_categories (id, name, slug, "doctorId", "isActive", "createdAt", "updatedAt")
            VALUES ($1, $2, $3, $4, true, NOW(), NOW())
          `, [categoryId, category.name, slug, doctorId]);
          
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
    
    // Step 7: Assign products to categories based on name patterns
    console.log('Assigning products to categories...');
    const productsResult = await pool.query(`
      SELECT id, name, "doctorId" 
      FROM products 
      WHERE "doctorId" IS NOT NULL
    `);
    
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
        await pool.query(`
          UPDATE products 
          SET "categoryId" = $1 
          WHERE id = $2
        `, [categoryId, product.id]);
        
        updatedCount++;
      }
    }
    
    console.log(`Updated ${updatedCount} products with category references.`);
    console.log(`\nMigration completed successfully!`);
    
    console.log('\nNext steps:');
    console.log('1. Update your Prisma schema to match the database changes');
    console.log('2. Run npx prisma generate to update the Prisma client');
    console.log('3. Update your code to use product.productCategory.name instead of product.category');
    
  } catch (error) {
    console.error('Error during migration:', error);
  } finally {
    await pool.end();
    console.log('Database connection closed.');
  }
}

// Check if pg package is installed
try {
  require.resolve('pg');
  
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
