/**
 * Script to add product categories and update products table using Prisma
 * 
 * This script:
 * 1. Creates default categories for each doctor
 * 2. Assigns products to appropriate categories
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const crypto = require('crypto');

// Generate a CUID-like ID (simplified version)
function generateId() {
  return 'c' + crypto.randomBytes(8).toString('hex');
}

async function main() {
  try {
    console.log('Starting product categories migration...');
    
    // Step 1: Define default categories
    const defaultCategories = [
      { name: 'Consultas', slug: 'consultas' },
      { name: 'Exames', slug: 'exames' },
      { name: 'Procedimentos', slug: 'procedimentos' },
      { name: 'Suplementos', slug: 'suplementos' },
      { name: 'Cursos', slug: 'cursos' },
      { name: 'Outros', slug: 'outros' }
    ];
    
    // Step 2: Get all doctors with products
    console.log('Getting all doctors with products...');
    const doctors = await prisma.user.findMany({
      where: {
        created_products: {
          some: {}
        }
      },
      select: {
        id: true,
        name: true
      }
    });
    
    console.log(`Found ${doctors.length} doctors with products.`);
    
    // Step 3: Create categories for each doctor
    console.log('Creating default categories for each doctor...');
    const categoryMap = new Map(); // Map to store doctorId_categoryName -> categoryId
    
    for (const doctor of doctors) {
      const doctorId = doctor.id;
      console.log(`Creating categories for doctor: ${doctorId} (${doctor.name || 'Unknown'})`);
      
      for (const category of defaultCategories) {
        // Check if category already exists for this doctor
        const existingCategory = await prisma.productCategory.findFirst({
          where: {
            name: category.name,
            doctorId: doctorId
          }
        });
        
        let categoryId;
        
        if (!existingCategory) {
          // Create new category
          const slug = `${category.slug}-${doctorId.substring(0, 6)}`;
          
          const newCategory = await prisma.productCategory.create({
            data: {
              name: category.name,
              slug: slug,
              doctorId: doctorId,
              isActive: true
            }
          });
          
          categoryId = newCategory.id;
          console.log(`Created category: ${category.name} (${categoryId}) for doctor: ${doctorId}`);
        } else {
          categoryId = existingCategory.id;
          console.log(`Category already exists: ${category.name} (${categoryId}) for doctor: ${doctorId}`);
        }
        
        // Store mapping
        const key = `${doctorId}_${category.name}`;
        categoryMap.set(key, categoryId);
      }
    }
    
    // Step 4: Assign products to categories based on name patterns
    console.log('Assigning products to categories...');
    const products = await prisma.products.findMany({
      where: {
        doctorId: {
          not: null
        }
      },
      select: {
        id: true,
        name: true,
        doctorId: true
      }
    });
    
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
        await prisma.products.update({
          where: {
            id: product.id
          },
          data: {
            categoryId: categoryId
          }
        });
        
        updatedCount++;
      }
    }
    
    console.log(`Updated ${updatedCount} products with category references.`);
    console.log(`\nMigration completed successfully!`);
    
    console.log('\nNext steps:');
    console.log('1. Update your code to use product.productCategory.name instead of product.category');
    console.log('2. After verifying everything works, you can remove the category field from the products model');
    
  } catch (error) {
    console.error('Error during migration:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
