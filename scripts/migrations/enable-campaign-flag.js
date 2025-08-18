/*
 Usage:
   DOCTOR_ID="<uuid>" node scripts/migrations/enable-campaign-flag.js
 or
   node scripts/migrations/enable-campaign-flag.js <doctor_id>

 This will upsert doctor_feature_flags row: (doctor_id, flag='CAMPAIGN_PAGES', enabled=true)
*/

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const argId = process.argv[2];
  const envId = process.env.DOCTOR_ID;
  const doctorId = argId || envId;
  if (!doctorId) {
    console.error('Missing doctor id. Pass as arg or DOCTOR_ID env var.');
    process.exit(1);
  }

  console.log('Enabling CAMPAIGN_PAGES for doctor:', doctorId);
  // Create table if not exists is already handled by prior migration.

  // Upsert by (doctor_id, flag)
  await prisma.$executeRawUnsafe(
    `INSERT INTO doctor_feature_flags (doctor_id, flag, enabled, created_at, updated_at)
     VALUES ($1, 'CAMPAIGN_PAGES', true, NOW(), NOW())
     ON CONFLICT (doctor_id, flag) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()`,
    doctorId
  );

  console.log('✅ Enabled.');
}

main()
  .catch((e) => {
    console.error('Error enabling flag:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
