// Seed 10 products for the first doctor user
// - Ensures default ProductCategory for the doctor
// - Creates 10 products with required fields
// - Assigns categories via categories_on_products pivot

const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

const DEFAULT_CATEGORIES = [
  'Consultas',
  'Exames',
  'Procedimentos',
  'Suplementos',
  'Cursos',
  'Outros',
];

function uuid() {
  return crypto.randomUUID();
}

function money(value) {
  // Prisma Decimal-friendly string
  return value.toFixed(2);
}

async function ensureDoctorAndCategories() {
  // Find a doctor to own the products
  let doctor = await prisma.user.findFirst({
    where: { role: 'DOCTOR', is_active: true },
  });
  if (!doctor) {
    // Create a temporary doctor if none exists
    doctor = await prisma.user.create({
      data: {
        id: uuid(),
        email: `doctor_${Date.now()}@example.com`,
        name: 'Seed Doctor',
        role: 'DOCTOR',
        is_active: true,
      },
    });
  }

  // Ensure categories for this doctor
  let categories = await prisma.productCategory.findMany({ where: { doctorId: doctor.id } });
  if (!categories || categories.length === 0) {
    categories = await Promise.all(
      DEFAULT_CATEGORIES.map((name) =>
        prisma.productCategory.create({
          data: {
            name,
            doctorId: doctor.id,
            isActive: true,
          },
        })
      )
    );
  }

  return { doctor, categories };
}

function sampleProducts(doctorId) {
  const items = [
    { name: 'Limpeza de Pele', category: 'Procedimentos', price: 250 },
    { name: 'Consulta Inicial', category: 'Consultas', price: 300 },
    { name: 'Exame Laboratorial', category: 'Exames', price: 180 },
    { name: 'Suplemento Ômega 3', category: 'Suplementos', price: 120 },
    { name: 'Curso de Skincare', category: 'Cursos', price: 450 },
    { name: 'Peeling Químico', category: 'Procedimentos', price: 400 },
    { name: 'Consulta de Retorno', category: 'Consultas', price: 200 },
    { name: 'Avaliação Corporal', category: 'Consultas', price: 220 },
    { name: 'Suplemento Vitamina D', category: 'Suplementos', price: 90 },
    { name: 'Exame de Imagem', category: 'Exames', price: 350 },
  ];

  return items.map((it, idx) => ({
    id: uuid(),
    name: it.name,
    subtitle: null,
    description: null,
    price: money(it.price),
    creditsPerUnit: money(0),
    category: it.category, // legacy required field
    isActive: true,
    doctorId,
    imageUrl: null,
    confirmationUrl: null,
    categoryId: null, // keep legacy nullable
  }));
}

async function run() {
  try {
    console.log('🌱 Seeding 10 products...');

    const { doctor, categories } = await ensureDoctorAndCategories();
    console.log(`👨‍⚕️ Using doctor: ${doctor.id} (${doctor.email})`);

    // Build 10 products
    const products = sampleProducts(doctor.id);

    // Create all products if not exist by name for this doctor
    const created = [];
    for (const p of products) {
      const exists = await prisma.products.findFirst({
        where: { name: p.name, doctorId: doctor.id },
      });
      if (exists) {
        console.log(`↩️  Skipping existing: ${p.name}`);
        created.push(exists);
        continue;
      }
      const item = await prisma.products.create({ data: p });
      created.push(item);
      console.log(`✅ Created: ${item.name}`);
    }

    // Assign categories via pivot (choose based on legacy category label)
    console.log('🔗 Assigning categories via pivot...');
    for (const product of created) {
      const legacy = product.category;
      const category = categories.find((c) => c.name === legacy) || categories[0];

      // Clear existing pivots for idempotency
      await prisma.categoriesOnProducts.deleteMany({ where: { productId: product.id } });

      // Create 1-2 category assignments
      const toAssign = [category.id];
      const second = categories.find((c) => c.id !== category.id);
      if (second) toAssign.push(second.id);

      await prisma.categoriesOnProducts.createMany({
        data: toAssign.map((cid) => ({ productId: product.id, categoryId: cid })),
        skipDuplicates: true,
      });

      console.log(`📦 ${product.name} -> ${toAssign.length} categories`);
    }

    const total = await prisma.products.count({ where: { doctorId: doctor.id } });
    console.log(`🎉 Done. Total products for doctor: ${total}`);
  } catch (err) {
    console.error('❌ Seed error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
