const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const productId = 'gyaia5tdawq1ufidjoqk3q0k';
  const urlOfferId = 'cmgv9jlje003wi6ceob3ug3yf';
  const usedOfferId = 'cmgv0bkki000vi68e8u6vlujr';

  console.log('\n=== Verificando ofertas ===\n');

  const offers = await prisma.offer.findMany({
    where: { productId },
    include: { paymentMethods: true },
    orderBy: { createdAt: 'asc' }
  });

  console.log(`Total de ofertas para o produto: ${offers.length}\n`);

  for (const offer of offers) {
    const isUrl = offer.id === urlOfferId;
    const isUsed = offer.id === usedOfferId;
    console.log(`${isUrl ? '🔗 URL:' : isUsed ? '✅ USADO:' : '  '} ${offer.id}`);
    console.log(`   Preço: R$ ${(offer.priceCents / 100).toFixed(2)}`);
    console.log(`   Ativo: ${offer.active}`);
    console.log(`   Subscription: ${offer.isSubscription}`);
    console.log(`   Métodos: ${offer.paymentMethods.map(m => `${m.method}=${m.active}`).join(', ')}`);
    console.log('');
  }

  // Verificar ofertas específicas
  const urlOffer = await prisma.offer.findUnique({ 
    where: { id: urlOfferId },
    include: { paymentMethods: true }
  });
  
  const usedOffer = await prisma.offer.findUnique({ 
    where: { id: usedOfferId },
    include: { paymentMethods: true }
  });

  console.log('\n=== Análise ===\n');
  
  if (!urlOffer) {
    console.log('❌ Oferta da URL NÃO EXISTE no banco!');
  } else {
    console.log(`✅ Oferta da URL existe:`);
    console.log(`   Preço: R$ ${(urlOffer.priceCents / 100).toFixed(2)}`);
    console.log(`   Produto: ${urlOffer.productId === productId ? '✅ Match' : '❌ Diferente'}`);
    console.log(`   Subscription: ${urlOffer.isSubscription ? '⚠️ SIM (seria rejeitada)' : '✅ NÃO'}`);
    console.log(`   Ativo: ${urlOffer.active ? '✅' : '❌'}`);
  }

  if (usedOffer) {
    console.log(`\n✅ Oferta usada pelo backend:`);
    console.log(`   Preço: R$ ${(usedOffer.priceCents / 100).toFixed(2)}`);
    console.log(`   Subscription: ${usedOffer.isSubscription ? '⚠️ SIM' : '✅ NÃO'}`);
    console.log(`   Ativo: ${usedOffer.active ? '✅' : '❌'}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
