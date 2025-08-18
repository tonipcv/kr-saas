const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Starting Prisma reset process...');

// Step 1: Clear Prisma's cache directories
const homedir = require('os').homedir();
const prismaCacheDirs = [
  path.join(homedir, '.prisma'),
  path.join(homedir, 'Library', 'Caches', 'Prisma'),
  path.join(process.cwd(), 'node_modules', '.prisma')
];

prismaCacheDirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    console.log(`Clearing Prisma cache at: ${dir}`);
    try {
      execSync(`rm -rf "${dir}"`);
      console.log(`Successfully cleared ${dir}`);
    } catch (error) {
      console.error(`Error clearing ${dir}:`, error.message);
    }
  } else {
    console.log(`Cache directory not found: ${dir}`);
  }
});

// Step 2: Delete node_modules/.prisma
const prismaNodeModulesDir = path.join(process.cwd(), 'node_modules', '.prisma');
if (fs.existsSync(prismaNodeModulesDir)) {
  console.log('Removing Prisma cache from node_modules...');
  try {
    execSync(`rm -rf "${prismaNodeModulesDir}"`);
    console.log('Successfully removed Prisma cache from node_modules');
  } catch (error) {
    console.error('Error removing Prisma cache from node_modules:', error.message);
  }
}

// Step 3: Regenerate Prisma client
console.log('Regenerating Prisma client...');
try {
  execSync('npx prisma generate', { stdio: 'inherit' });
  console.log('Successfully regenerated Prisma client');
} catch (error) {
  console.error('Error regenerating Prisma client:', error.message);
}

console.log('\nPrisma reset complete! Please restart your application.');
console.log('Run: npm run dev');
