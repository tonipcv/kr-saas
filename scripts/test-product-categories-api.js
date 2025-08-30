// Script para testar a API de produtos e verificar a relação de categorias
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testProductCategoriesAPI() {
  try {
    console.log('🔍 Testando API de produtos e relação de categorias...');
    
    // 1. Buscar um produto existente com suas categorias
    console.log('\n📦 Buscando um produto existente...');
    const product = await prisma.products.findFirst({
      include: {
        categories: {
          include: {
            category: true
          }
        },
        productCategory: true // Relação 1:N legada
      }
    });
    
    if (!product) {
      console.log('❌ Nenhum produto encontrado!');
      return;
    }
    
    console.log(`✅ Produto encontrado: ${product.id} - ${product.name}`);
    
    // 2. Verificar as categorias do produto
    console.log('\n📋 Categorias do produto:');
    if (product.categories && product.categories.length > 0) {
      product.categories.forEach(cp => {
        console.log(`- ${cp.category.id}: ${cp.category.name}`);
      });
    } else {
      console.log('❌ Produto não tem categorias na relação N:N');
    }
    
    // 3. Verificar a categoria legada
    if (product.productCategory) {
      console.log(`\n📌 Categoria legada: ${product.productCategory.id} - ${product.productCategory.name}`);
    } else {
      console.log('❌ Produto não tem categoria legada');
    }
    
    // 4. Buscar todas as categorias disponíveis
    console.log('\n🔍 Buscando todas as categorias disponíveis...');
    const categories = await prisma.productCategory.findMany({
      where: {
        doctorId: product.doctorId // Usar o mesmo doctorId do produto encontrado
      }
    });
    
    console.log(`✅ Categorias encontradas: ${categories.length}`);
    categories.forEach(cat => {
      console.log(`- ${cat.id}: ${cat.name}`);
    });
    
    // 5. Testar atualização de categorias para um produto
    if (categories.length >= 2) {
      console.log('\n🔄 Testando atualização de categorias para o produto...');
      
      // Selecionar duas categorias diferentes para teste
      const categoryIds = categories.slice(0, 2).map(c => c.id);
      console.log(`📌 Categorias selecionadas: ${categoryIds.join(', ')}`);
      
      // Limpar categorias existentes
      await prisma.categoriesOnProducts.deleteMany({
        where: {
          productId: product.id
        }
      });
      
      // Adicionar novas categorias
      const newCategories = await Promise.all(
        categoryIds.map(categoryId => 
          prisma.categoriesOnProducts.create({
            data: {
              productId: product.id,
              categoryId
            }
          })
        )
      );
      
      console.log(`✅ Categorias atualizadas: ${newCategories.length}`);
      
      // Verificar se as categorias foram atualizadas
      const updatedProduct = await prisma.products.findUnique({
        where: {
          id: product.id
        },
        include: {
          categories: {
            include: {
              category: true
            }
          }
        }
      });
      
      console.log('\n📋 Categorias atualizadas do produto:');
      if (updatedProduct.categories && updatedProduct.categories.length > 0) {
        updatedProduct.categories.forEach(cp => {
          console.log(`- ${cp.category.id}: ${cp.category.name}`);
        });
      } else {
        console.log('❌ Produto não tem categorias após atualização');
      }
    }
    
  } catch (error) {
    console.error('❌ Erro ao testar API de produtos:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testProductCategoriesAPI();
