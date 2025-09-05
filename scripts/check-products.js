const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkProducts() {
  try {
    const products = await prisma.$queryRaw`
      SELECT 
        COUNT(*)::int as total,
        COUNT(CASE WHEN "clinic_id" IS NOT NULL THEN 1 END)::int as with_clinic,
        COUNT(CASE WHEN "clinic_id" IS NULL THEN 1 END)::int as without_clinic
      FROM "products"`;
    
    console.log('Products stats:', products[0]);
    
    // Get sample of products with their details
    const sampleProducts = await prisma.$queryRaw`
      SELECT 
        p.id,
        p.name,
        p."doctorId",
        p."clinic_id",
        u.name as doctor_name,
        c.name as clinic_name
      FROM "products" p
      LEFT JOIN "User" u ON u.id = p."doctorId"
      LEFT JOIN "clinics" c ON c.id = p."clinic_id"
      LIMIT 5`;
    
    console.log('\nSample products:', sampleProducts);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkProducts();
