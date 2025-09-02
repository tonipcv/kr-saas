// Check coupon templates table structure and data
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    // Check table structure
    const tableInfo = await prisma.$queryRaw`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'coupon_templates'
    `;
    console.log('Table structure:', tableInfo);

    // Check if template with slug 'joao' exists
    const template = await prisma.$queryRaw`
      SELECT id, doctor_id, slug, name, display_title, display_message, is_active 
      FROM coupon_templates 
      WHERE LOWER(slug) = 'joao'
    `;
    console.log('Template with slug "joao":', template);

    // Check if template with slug 'black' exists
    const blackTemplate = await prisma.$queryRaw`
      SELECT id, doctor_id, slug, name, display_title, display_message, is_active 
      FROM coupon_templates 
      WHERE LOWER(slug) = 'black'
    `;
    console.log('Template with slug "black":', blackTemplate);

    // Check if the doctor for bella-vida clinic exists
    const clinic = await prisma.clinic.findFirst({
      where: { slug: 'bella-vida', isActive: true },
      select: { id: true, ownerId: true, name: true },
    });
    console.log('Clinic bella-vida:', clinic);

    if (clinic?.ownerId) {
      const owner = await prisma.user.findUnique({
        where: { id: clinic.ownerId },
        select: { id: true, name: true, doctor_slug: true, is_active: true },
      });
      console.log('Clinic owner:', owner);

      // Check if the owner has any coupon templates
      const ownerTemplates = await prisma.$queryRaw`
        SELECT id, doctor_id, slug, name, display_title, display_message, is_active 
        FROM coupon_templates 
        WHERE doctor_id = ${owner.id}
      `;
      console.log('Owner templates:', ownerTemplates);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
