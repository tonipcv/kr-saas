/**
 * Script to add product categories and update products table
 * 
 * This script:
 * 1. Creates a product_categories table
 * 2. Adds subtitle field to products table
 * 3. Adds categoryId field to products table
 * 4. Backfills product_categories from existing product categories
 * 5. Updates products to reference the new categories
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const readline = require('readline');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function main() {
  try {
    console.log('Starting product categories migration...');
    
    // Step 1: Get all unique doctor/category combinations
    console.log('Analyzing existing product categories...');
    const uniqueCategories = await prisma.$queryRaw`
      SELECT DISTINCT "doctorId", category 
      FROM products 
      WHERE category IS NOT NULL AND category != ''
      ORDER BY "doctorId", category
    `;
    
    console.log(`Found ${uniqueCategories.length} unique categories to migrate.`);
    
    // Step 2: Create categories
    console.log('Creating product categories...');
    const categoryMap = new Map(); // To store category name -> id mapping
    
    for (const cat of uniqueCategories) {
      const doctorId = cat.doctorId;
      const categoryName = cat.category;
      
      // Generate a slug from the category name
      const slug = categoryName
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, '-');
      
      // Create the category
      const newCategory = await prisma.productCategory.create({
        data: {
          name: categoryName,
          slug: `${slug}-${Math.floor(Math.random() * 1000)}`, // Add random suffix to ensure uniqueness
          doctorId: doctorId,
          isActive: true
        }
      });
      
      // Store mapping of doctorId+category to categoryId
      const key = `${doctorId || 'null'}_${categoryName}`;
      categoryMap.set(key, newCategory.id);
      
      console.log(`Created category: ${categoryName} (${newCategory.id}) for doctor: ${doctorId || 'global'}`);
    }
    
    // Step 3: Update products to reference the new categories
    console.log('Updating products to reference new categories...');
    const products = await prisma.products.findMany({
      select: {
        id: true,
        doctorId: true,
        category: true
      },
      where: {
        category: {
          not: null
        }
      }
    });
    
    console.log(`Found ${products.length} products to update with category references.`);
    
    // Update products in batches to avoid overloading the database
    const batchSize = 50;
    let updatedCount = 0;
    
    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (product) => {
        const key = `${product.doctorId || 'null'}_${product.category}`;
        const categoryId = categoryMap.get(key);
        
        if (categoryId) {
          await prisma.products.update({
            where: { id: product.id },
            data: { categoryId: categoryId }
          });
          updatedCount++;
        }
      }));
      
      console.log(`Updated ${Math.min(i + batchSize, products.length)} of ${products.length} products...`);
    }
    
    console.log(`Migration completed successfully!`);
    console.log(`Created ${uniqueCategories.length} product categories.`);
    console.log(`Updated ${updatedCount} products with category references.`);
    
    console.log('\nNext steps:');
    console.log('1. Update your code to use product.productCategory.name instead of product.category');
    console.log('2. After verifying everything works, you can remove the category field from the products model');
    
  } catch (error) {
    console.error('Error during migration:', error);
  } finally {
    await prisma.$disconnect();
    rl.close();
  }
}

// Run the migration
main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
