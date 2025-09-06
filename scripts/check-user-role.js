#!/usr/bin/env node
/*
  Usage:
    node scripts/check-user-role.js <email>

  Example:
    node scripts/check-user-role.js xppsalvador@gmail.com
*/

const { prisma } = require('../dist/lib/prisma.js');

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Please provide an email.\nUsage: node scripts/check-user-role.js <email>');
    process.exit(1);
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, role: true },
    });

    if (!user) {
      console.log('User not found');
      return;
    }

    console.log('User info:');
    console.log(JSON.stringify(user, null, 2));
    console.log(`\nIs SUPER_ADMIN? ${user.role === 'SUPER_ADMIN' ? 'YES' : 'NO'}`);
  } catch (err) {
    console.error('Error querying user:', err?.message || err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
