const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function debugProductClinicRelationship() {
  try {
    console.log('🔍 Debugando relação Produto-Clínica...\n');

    // 1. Verificar quantos produtos existem no total
    const totalProducts = await prisma.products.count();
    console.log(`📦 Total de produtos no sistema: ${totalProducts}`);

    // 2. Verificar produtos por médico
    const productsByDoctor = await prisma.products.groupBy({
      by: ['doctorId'],
      _count: true
    });
    console.log('\n👨‍⚕️ Produtos por médico:');
    for (const group of productsByDoctor) {
      if (group.doctorId) {
        const doctor = await prisma.user.findUnique({
          where: { id: group.doctorId },
          include: {
            owned_clinics: true,
            clinic_memberships: {
              include: { clinic: true }
            }
          }
        });
        console.log(`\n--- Médico: ${doctor.name} (${doctor.email}) ---`);
        console.log(`Total produtos: ${group._count}`);
        console.log('Clínicas:');
        doctor.owned_clinics.forEach(clinic => {
          console.log(`  - ${clinic.name} (Owner)`);
        });
        doctor.clinic_memberships.forEach(membership => {
          console.log(`  - ${membership.clinic.name} (${membership.role})`);
        });
      } else {
        console.log('\n--- Produtos sem médico ---');
        console.log(`Total: ${group._count}`);
      }
    }

    // 3. Verificar produtos usados em protocolos
    const productsInProtocols = await prisma.protocol_products.groupBy({
      by: ['productId'],
      _count: true
    });
    console.log('\n🔄 Produtos em protocolos:');
    console.log(`Total: ${productsInProtocols.length}`);

    // 4. Analisar alguns produtos de exemplo
    console.log('\n📋 Exemplos de produtos:');
    const sampleProducts = await prisma.products.findMany({
      take: 5,
      include: {
        doctor: {
          include: {
            owned_clinics: true,
            clinic_memberships: true
          }
        },
        protocol_products: {
          include: {
            protocols: true
          }
        }
      }
    });

    sampleProducts.forEach((product, i) => {
      console.log(`\n--- Produto ${i + 1} ---`);
      console.log(`Nome: ${product.name}`);
      console.log(`Médico: ${product.doctor?.name || 'Sem médico'}`);
      console.log(`Usado em ${product.protocol_products.length} protocolos:`);
      product.protocol_products.forEach(pp => {
        console.log(`  - ${pp.protocols.name}`);
      });
    });

    // 5. Verificar produtos por categoria
    const productsByCategory = await prisma.products.groupBy({
      by: ['category'],
      _count: true
    });
    console.log('\n📊 Produtos por categoria:');
    productsByCategory.forEach(cat => {
      console.log(`${cat.category}: ${cat._count}`);
    });

    // 6. Conclusão
    console.log('\n\n🎯 DIAGNÓSTICO:');
    console.log('1. Produtos atualmente vinculados apenas ao médico (doctorId)');
    console.log('2. Não há vínculo direto com clínicas');
    console.log('3. Produtos são usados em protocolos que pertencem a médicos');
    
    console.log('\n💡 SOLUÇÃO PROPOSTA:');
    console.log('1. Adicionar campo clinicId na tabela products');
    console.log('2. Migrar produtos existentes para a clínica principal do médico');
    console.log('3. Atualizar APIs para filtrar produtos por clínica');
    console.log('4. Atualizar interface para refletir contexto da clínica');

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugProductClinicRelationship();
