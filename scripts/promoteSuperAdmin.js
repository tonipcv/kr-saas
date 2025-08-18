#!/usr/bin/env node

/*
  Usage:
    node scripts/promoteSuperAdmin.js [email]

  Example:
    node scripts/promoteSuperAdmin.js xppsalvador@gmail.com
*/

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2] || 'xppsalvador@gmail.com';

  if (!email || !email.includes('@')) {
    console.error('Please provide a valid email.\nUsage: node scripts/promoteSuperAdmin.js user@example.com');
    process.exit(1);
  }

  console.log(`Promoting user to SUPER_ADMIN: ${email}`);

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    console.error(`User not found for email: ${email}`);
    process.exit(1);
  }

  if (user.role === 'SUPER_ADMIN') {
    console.log('User is already SUPER_ADMIN. No changes made.');
    return;
  }

  const updated = await prisma.user.update({
    where: { email },
    data: {
      role: 'SUPER_ADMIN',
      is_active: true,
      updated_at: new Date(),
    },
    select: { id: true, email: true, role: true, is_active: true, updated_at: true },
  });

  console.log('Updated user:', updated);
}

main()
  .catch((e) => {
    console.error('Error promoting user:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
