const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getUserClinics(userId) {
  try {
    // Buscar todas as clínicas onde o usuário é owner
    const ownedClinics = await prisma.$queryRawUnsafe(`
      SELECT 
        c.*,
        u.id as owner_id,
        u.name as owner_name,
        u.email as owner_email,
        cm.id as member_id,
        cm.role as member_role,
        cm."isActive" as member_is_active,
        cm."joinedAt" as member_joined_at,
        mu.id as member_user_id,
        mu.name as member_user_name,
        mu.email as member_user_email,
        mu.role as member_user_role
      FROM "clinics" c
      JOIN "User" u ON u.id = c."ownerId"
      LEFT JOIN "clinic_members" cm ON cm."clinicId" = c.id
      LEFT JOIN "User" mu ON mu.id = cm."userId"
      WHERE c."ownerId" = $1
        AND c."isActive" = true
      ORDER BY c."createdAt" DESC`,
      userId
    );

    // Buscar clínicas onde o usuário é membro (não owner)
    const memberClinics = await prisma.$queryRawUnsafe(`
      SELECT DISTINCT
        c.*,
        u.id as owner_id,
        u.name as owner_name,
        u.email as owner_email,
        cm.id as member_id,
        cm.role as member_role,
        cm."isActive" as member_is_active,
        cm."joinedAt" as member_joined_at,
        mu.id as member_user_id,
        mu.name as member_user_name,
        mu.email as member_user_email,
        mu.role as member_user_role
      FROM "clinics" c
      JOIN "User" u ON u.id = c."ownerId"
      JOIN "clinic_members" cm ON cm."clinicId" = c.id
      LEFT JOIN "clinic_members" cm2 ON cm2."clinicId" = c.id
      LEFT JOIN "User" mu ON mu.id = cm2."userId"
      WHERE cm."userId" = $1
        AND cm."isActive" = true
        AND c."isActive" = true
        AND c."ownerId" != $1
      ORDER BY c."createdAt" DESC`,
      userId
    );

    // Combinar e processar todas as clínicas
    const allClinicsData = [...ownedClinics, ...memberClinics];
    const clinicsMap = new Map();

    // Agrupar por clínica
    allClinicsData.forEach(row => {
      const clinicId = row.id;
      if (!clinicsMap.has(clinicId)) {
        clinicsMap.set(clinicId, []);
      }
      clinicsMap.get(clinicId).push(row);
    });

    const clinics = [];

    for (const [clinicId, clinicRows] of clinicsMap) {
      const clinic = clinicRows[0];

      // Buscar subscription da clínica
      const sub = await prisma.$queryRawUnsafe(`
        SELECT 
          cs.*,
          cp.*
        FROM "clinic_subscriptions" cs
        JOIN "clinic_plans" cp ON cp.id = cs.plan_id
        WHERE cs.clinic_id = $1
        AND cs.status::text IN ('ACTIVE', 'TRIAL')
        ORDER BY cs.created_at DESC
        LIMIT 1`,
        clinicId
      );

      // Agrupar membros únicos
      const uniqueMembers = new Map();
      clinicRows.forEach(row => {
        if (row.member_id && !uniqueMembers.has(row.member_id)) {
          uniqueMembers.set(row.member_id, {
            id: row.member_id,
            role: row.member_role,
            isActive: row.member_is_active,
            joinedAt: row.member_joined_at,
            user: {
              id: row.member_user_id,
              name: row.member_user_name,
              email: row.member_user_email,
              role: row.member_user_role
            }
          });
        }
      });

      const members = Array.from(uniqueMembers.values());

      const subscription = sub && sub.length > 0
        ? {
            id: sub[0].id,
            status: sub[0].status,
            maxDoctors: sub[0].base_doctors,
            startDate: sub[0].start_date,
            endDate: sub[0].current_period_end ?? null,
            trialEndDate: sub[0].trial_ends_at ?? null,
            plan: {
              name: sub[0].name,
              maxPatients: sub[0].base_patients,
              maxProtocols: (sub[0].features)?.maxProtocols ?? null,
              maxCourses: (sub[0].features)?.maxCourses ?? null,
              maxProducts: (sub[0].features)?.maxProducts ?? null,
              price: Number(sub[0].monthly_price) ?? null
            }
          }
        : null;

      clinics.push({
        id: clinic.id,
        name: clinic.name,
        description: clinic.description,
        logo: clinic.logo,
        slug: clinic.slug,
        ownerId: clinic.ownerid,
        isActive: clinic.isactive,
        createdAt: clinic.createdat,
        updatedAt: clinic.updatedat,
        owner: {
          id: clinic.owner_id,
          name: clinic.owner_name,
          email: clinic.owner_email
        },
        members,
        subscription
      });
    }

    return clinics;
  } catch (error) {
    console.error('Error fetching user clinics:', error);
    return [];
  }
}

async function runFix() {
  try {
    console.log('Starting fix...');
    
    // Test with a known user ID
    const userId = process.argv[2];
    if (!userId) {
      console.error('Please provide a user ID as argument');
      process.exit(1);
    }

    console.log('Testing getUserClinics with user ID:', userId);
    const clinics = await getUserClinics(userId);
    console.log('Found clinics:', clinics.length);
    console.log('Clinics:', JSON.stringify(clinics, null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

runFix();
