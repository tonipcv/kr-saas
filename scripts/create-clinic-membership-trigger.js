const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createClinicMembershipTrigger() {
  try {
    // Create function to handle new clinics
    await prisma.$executeRaw`
      CREATE OR REPLACE FUNCTION apply_membership_templates()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Insert membership levels from templates for the new clinic
        INSERT INTO membership_levels (
          id,
          name,
          slug,
          min_points,
          is_active,
          clinic_id,
          created_at,
          updated_at
        )
        SELECT
          gen_random_uuid()::text,
          name,
          CASE 
            WHEN slug IS NOT NULL THEN slug || '-' || NEW.id 
            ELSE NULL 
          END,
          min_points,
          is_active,
          NEW.id,
          now(),
          now()
        FROM membership_level_templates
        WHERE is_active = true;
        
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `;
    console.log('Created apply_membership_templates function');

    // Create trigger
    await prisma.$executeRaw`
      DROP TRIGGER IF EXISTS trg_apply_membership_templates ON clinics;
    `;
    
    await prisma.$executeRaw`
      CREATE TRIGGER trg_apply_membership_templates
      AFTER INSERT ON clinics
      FOR EACH ROW
      EXECUTE FUNCTION apply_membership_templates();
    `;
    console.log('Created trigger on clinics table');

    console.log('\nTrigger setup completed successfully');
  } catch (error) {
    console.error('Error during trigger setup:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run setup
createClinicMembershipTrigger()
  .catch(console.error);
