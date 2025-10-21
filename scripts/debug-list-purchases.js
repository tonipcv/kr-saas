#!/usr/bin/env node
/*
  List last 10 purchases with product clinic, doctor and user info
  Usage:
    node scripts/debug-list-purchases.js [clinicId]
*/
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  const clinicId = process.argv[2] || null;
  try {
    const where = clinicId
      ? { OR: [ { product: { clinicId } }, { doctor: { owned_clinics: { some: { id: clinicId } } } } ] }
      : {};
    const items = await prisma.purchase.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        product: { select: { id: true, name: true, clinicId: true } },
        doctor: { select: { id: true, name: true } },
        user: { select: { id: true, email: true } },
      }
    });
    console.log(JSON.stringify({ count: items.length, items }, null, 2));
  } catch (e) {
    console.error('Error listing purchases:', e?.message || e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
