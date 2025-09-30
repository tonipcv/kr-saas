#!/usr/bin/env node
/*
  List first 20 clinics to help fetch a clinicId for testing.
  Usage: node scripts/debug/list_clinics.js
*/

const { prisma } = require('../../dist/lib/prisma.js');

async function main() {
  console.log('[debug] DATABASE_URL:', process.env.DATABASE_URL ? '(set)' : '(missing)');
  const clinics = await prisma.clinic.findMany({
    take: 20,
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, slug: true, ownerId: true, createdAt: true },
  });
  console.table(clinics.map(c => ({ id: c.id, name: c.name, slug: c.slug, ownerId: c.ownerId, createdAt: c.createdAt })));
}

main()
  .catch((e) => { console.error('[debug] Error:', e); process.exit(1); })
  .finally(async () => { try { await prisma.$disconnect(); } catch {} });
