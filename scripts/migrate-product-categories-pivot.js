// Script para criar a tabela pivot categories_on_products e migrar dados existentes
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Iniciando migração de categorias de produtos para relação N:N');

  try {
    // 1. Verificar se a tabela já existe
    console.log('📊 Verificando se a tabela categories_on_products já existe...');
    const tableExists = await prisma.$queryRaw`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'categories_on_products'
    `;
    
    if (tableExists.length > 0) {
      console.log('⚠️ Tabela categories_on_products já existe. Pulando criação.');
    } else {
      // 2. Criar a tabela pivot usando SQL direto
      console.log('📝 Criando tabela categories_on_products...');
      await prisma.$executeRaw`
        CREATE TABLE categories_on_products (
          product_id TEXT NOT NULL,
          category_id TEXT NOT NULL,
          assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (product_id, category_id),
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
          FOREIGN KEY (category_id) REFERENCES product_categories(id) ON DELETE CASCADE
        );
      `;
      console.log('✅ Tabela categories_on_products criada com sucesso!');
    }

    // 3. Migrar dados existentes: para cada produto, inserir relação com sua categoria atual
    console.log('🔄 Migrando dados existentes para a nova tabela pivot...');
    
    // Buscar todos os produtos que têm categoryId definido
    const products = await prisma.products.findMany({
      where: {
        categoryId: { not: null }
      },
      select: {
        id: true,
        categoryId: true,
        category: true,
        doctorId: true
      }
    });
    
    console.log(`📦 Encontrados ${products.length} produtos com categoryId para migrar`);
    
    // Para cada produto, inserir na tabela pivot
    let migratedCount = 0;
    let skippedCount = 0;
    
    for (const product of products) {
      if (!product.categoryId) {
        skippedCount++;
        continue;
      }
      
      // Verificar se a relação já existe para evitar duplicatas usando SQL direto
      const existingRelations = await prisma.$queryRaw`
        SELECT * FROM categories_on_products 
        WHERE product_id = ${product.id} AND category_id = ${product.categoryId}
      `;
      
      if (existingRelations.length === 0) {
        // Inserir usando SQL direto
        await prisma.$executeRaw`
          INSERT INTO categories_on_products (product_id, category_id)
          VALUES (${product.id}, ${product.categoryId})
        `;
        migratedCount++;
      } else {
        skippedCount++;
      }
    }
    
    console.log(`✅ Migração concluída! ${migratedCount} relações criadas, ${skippedCount} puladas.`);
    
    // 4. Verificar produtos sem categoryId mas com category string
    const productsWithoutCategoryId = await prisma.products.findMany({
      where: {
        categoryId: null,
        category: { not: '' }
      },
      select: {
        id: true,
        category: true,
        doctorId: true
      }
    });
    
    console.log(`📦 Encontrados ${productsWithoutCategoryId.length} produtos sem categoryId mas com category string`);
    
    // Para cada produto sem categoryId, tentar encontrar categoria pelo nome
    let matchedByNameCount = 0;
    
    for (const product of productsWithoutCategoryId) {
      if (!product.category || !product.doctorId) continue;
      
      // Buscar categoria pelo nome e doctorId
      const matchingCategory = await prisma.productCategory.findFirst({
        where: {
          name: product.category,
          doctorId: product.doctorId
        }
      });
      
      if (matchingCategory) {
        // Verificar se a relação já existe usando SQL direto
        const existingRelations = await prisma.$queryRaw`
          SELECT * FROM categories_on_products 
          WHERE product_id = ${product.id} AND category_id = ${matchingCategory.id}
        `;
        
        if (existingRelations.length === 0) {
          // Inserir usando SQL direto
          await prisma.$executeRaw`
            INSERT INTO categories_on_products (product_id, category_id)
            VALUES (${product.id}, ${matchingCategory.id})
          `;
          matchedByNameCount++;
          
          // Atualizar o categoryId do produto também
          await prisma.products.update({
            where: { id: product.id },
            data: { categoryId: matchingCategory.id }
          });
        }
      }
    }
    
    console.log(`✅ ${matchedByNameCount} produtos atualizados com base no nome da categoria`);
    
    console.log('🎉 Migração concluída com sucesso!');
  } catch (error) {
    console.error('❌ Erro durante a migração:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    console.log('✅ Script finalizado');
    process.exit(0);
  })
  .catch((e) => {
    console.error('❌ Erro no script:', e);
    process.exit(1);
  });
