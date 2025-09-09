import { prisma } from '@/lib/prisma';
import { getClinicSubscriptionStatus } from '@/lib/subscription';

// ========== TIPOS ==========
export interface ClinicWithDetails {
  id: string;
  name: string;
  description: string | null;
  logo: string | null;
  slug: string | null;
  // New: expose subdomain and branding fields so UI can render saved values
  subdomain?: string | null;
  theme?: 'LIGHT' | 'DARK';
  buttonColor?: string | null;
  buttonTextColor?: string | null;
  website?: string | null;
  city?: string | null;
  state?: string | null;
  ownerId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  owner: {
    id: string;
    name: string | null;
    email: string | null;
  };
  members: {
    id: string;
    role: string;
    isActive: boolean;
    joinedAt: Date;
    user: {
      id: string;
      name: string | null;
      email: string | null;
      role: string;
    };
  }[];
  subscription?: {
    id: string;
    status: string;
    maxDoctors: number;
    startDate: Date;
    endDate: Date | null;
    trialEndDate?: Date | null;
    plan: {
      name: string;
      maxPatients: number | null;
      maxProtocols: number | null;
      maxCourses: number | null;
      maxProducts: number | null;
      price?: number | null;
    };
  } | null;
}

export interface ClinicData {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  phone?: string;
  email?: string;
  website?: string;
  description?: string;
  logo?: string | null;
}

// ========== FUNÇÕES DE CLÍNICA ==========

/**
 * Buscar TODAS as clínicas do usuário (como owner ou membro)
 */
export async function getUserClinics(userId: string): Promise<ClinicWithDetails[]> {
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
    const clinicsMap = new Map<string, any[]>();

    // Agrupar por clínica
    allClinicsData.forEach(row => {
      const clinicId = row.id;
      if (!clinicsMap.has(clinicId)) {
        clinicsMap.set(clinicId, []);
      }
      clinicsMap.get(clinicId)!.push(row);
    });

    const clinics: ClinicWithDetails[] = [];

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
              maxProtocols: (sub[0].features as any).maxProtocols ?? null,
              maxCourses: (sub[0].features as any).maxCourses ?? null,
              maxProducts: (sub[0].features as any).maxProducts ?? null,
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
        // Pass-through fields selected via c.* from raw queries
        // @ts-expect-error raw select from clinics may include these columns
        subdomain: (clinic as any).subdomain ?? null,
        // @ts-expect-error theme/button fields may exist in DB
        theme: (clinic as any).theme ?? undefined,
        // @ts-expect-error theme/button fields may exist in DB
        buttonColor: (clinic as any).buttonColor ?? null,
        // @ts-expect-error theme/button fields may exist in DB
        buttonTextColor: (clinic as any).buttonTextColor ?? null,
        website: (clinic as any).website ?? null,
        city: (clinic as any).city ?? null,
        state: (clinic as any).state ?? null,
        ownerId: clinic.ownerId,
        isActive: clinic.isActive,
        createdAt: clinic.createdAt,
        updatedAt: clinic.updatedAt,
        owner: {
          id: clinic.owner_id,
          name: clinic.owner_name,
          email: clinic.owner_email
        },
        members,
        subscription
      } as ClinicWithDetails);
    }

    return clinics;
  } catch (error) {
    console.error('Error fetching user clinics:', error);
    return [];
  }
}

/**
 * Buscar clínica do usuário (como owner ou membro) - retorna a primeira/principal
 */
export async function getUserClinic(userId: string): Promise<ClinicWithDetails | null> {
  const clinics = await getUserClinics(userId);
  return clinics.length > 0 ? clinics[0] : null;
}

/**
 * Verificar se usuário pode adicionar mais médicos na clínica
 */
export async function canAddDoctorToClinic(clinicId: string): Promise<boolean> {
  const [clinic, sub] = await Promise.all([
    prisma.$queryRaw`
      SELECT COUNT(*)::int as member_count
      FROM clinic_members
      WHERE "clinicId" = ${clinicId}
      AND "isActive" = true
    `,
    prisma.$queryRaw`
      SELECT cp.base_doctors
      FROM clinic_subscriptions cs
      JOIN clinic_plans cp ON cp.id = cs.plan_id
      WHERE cs.clinic_id = ${clinicId}
      AND cs.status::text IN ('ACTIVE', 'TRIAL')
      ORDER BY cs.created_at DESC
      LIMIT 1
    `
  ]);

  if (!clinic.length || !sub.length) return false;

  const currentDoctors = clinic[0].member_count;
  const limit = sub[0].base_doctors;
  return currentDoctors < limit;
}

/**
 * Verificar se usuário pode criar mais protocolos
 */
export async function canCreateProtocol(userId: string): Promise<boolean> {
  const status = await getClinicSubscriptionStatus(userId);
  if (!status || !status.isActive) return false;

  const clinic = await getUserClinic(userId);
  if (!clinic) return false;
  const memberIds = clinic.members.map(m => m.user.id);
  const protocolCount = await prisma.protocol.count({ where: { doctor_id: { in: memberIds } } });
  const maxProtocols = status.limits.maxProtocols ?? 0;
  return protocolCount < maxProtocols;
}

/**
 * Verificar se usuário pode adicionar mais pacientes
 */
export async function canAddPatient(userId: string): Promise<boolean> {
  const status = await getClinicSubscriptionStatus(userId);
  if (!status || !status.isActive) return false;

  const clinic = await getUserClinic(userId);
  if (!clinic) return false;
  const memberIds = clinic.members.map(m => m.user.id);
  const patientCount = await prisma.user.count({
    where: { role: 'PATIENT', doctorId: { in: memberIds } }
  });
  const maxPatients = status.limits.maxPatients ?? 0;
  return patientCount < maxPatients;
}

/**
 * Adicionar médico à clínica
 */
export async function addDoctorToClinic(
  clinicId: string, 
  doctorEmail: string, 
  role: 'DOCTOR' | 'ADMIN' = 'DOCTOR'
): Promise<{ success: boolean; message: string; member?: any }> {
  try {
    // Verificar se pode adicionar mais médicos
    const canAdd = await canAddDoctorToClinic(clinicId);
    if (!canAdd) {
      return { success: false, message: 'Limite de médicos atingido para esta clínica' };
    }

    // Buscar o médico pelo email
    const doctor = await prisma.user.findUnique({
      where: { email: doctorEmail }
    });

    if (!doctor) {
      return { success: false, message: 'Médico não encontrado' };
    }

    if (doctor.role !== 'DOCTOR') {
      return { success: false, message: 'Usuário não é um médico' };
    }

    // Verificar se já é membro
    const existingMember = await prisma.clinicMember.findUnique({
      where: {
        clinicId_userId: {
          clinicId,
          userId: doctor.id
        }
      }
    });

    if (existingMember) {
      return { success: false, message: 'Médico já é membro desta clínica' };
    }

    // Adicionar como membro
    const member = await prisma.clinicMember.create({
      data: {
        clinicId,
        userId: doctor.id,
        role
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true }
        }
      }
    });

    return { 
      success: true, 
      message: 'Médico adicionado com sucesso', 
      member 
    };

  } catch (error) {
    console.error('Erro ao adicionar médico à clínica:', error);
    return { success: false, message: 'Erro interno do servidor' };
  }
}

/**
 * Remover médico da clínica
 */
export async function removeDoctorFromClinic(
  clinicId: string, 
  doctorId: string
): Promise<{ success: boolean; message: string }> {
  try {
    // Verificar se é o owner da clínica
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId }
    });

    if (clinic?.ownerId === doctorId) {
      return { success: false, message: 'Não é possível remover o proprietário da clínica' };
    }

    // Remover membro
    await prisma.clinicMember.delete({
      where: {
        clinicId_userId: {
          clinicId,
          userId: doctorId
        }
      }
    });

    return { success: true, message: 'Médico removido com sucesso' };

  } catch (error) {
    console.error('Erro ao remover médico da clínica:', error);
    return { success: false, message: 'Erro interno do servidor' };
  }
}

/**
 * Verificar se usuário é admin da clínica
 */
export async function isClinicAdmin(userId: string, clinicId?: string): Promise<boolean> {
  if (!clinicId) {
    const clinic = await getUserClinic(userId);
    clinicId = clinic?.id;
  }

  if (!clinicId) return false;

  // Verificar se é owner
  const clinic = await prisma.clinic.findFirst({
    where: { 
      id: clinicId,
      ownerId: userId 
    }
  });

  if (clinic) return true;

  // Verificar se é membro com role ADMIN
  const member = await prisma.clinicMember.findFirst({
    where: {
      clinicId,
      userId,
      role: 'ADMIN',
      isActive: true
    }
  });

  return !!member;
}

/**
 * Garantir que médico tenha clínica - criar automaticamente se necessário
 */
export async function ensureDoctorHasClinic(doctorId: string): Promise<{ success: boolean; clinic?: any; message: string }> {
  try {
    // Verificar se é médico
    const doctor = await prisma.user.findUnique({
      where: { id: doctorId },
      select: { id: true, name: true, email: true, role: true }
    });

    if (!doctor || doctor.role !== 'DOCTOR') {
      return { success: false, message: 'Usuário não é um médico' };
    }

    // Verificar se já possui clínica (como owner OU como membro)
    const existingClinic = await getUserClinic(doctorId);
    if (existingClinic) {
      return { success: true, clinic: existingClinic, message: 'Médico já possui clínica' };
    }

    // Buscar plano padrão
    const defaultPlan = await prisma.clinicPlan.findFirst({
      where: { tier: 'STARTER', isActive: true }
    });

    if (!defaultPlan) {
      return { success: false, message: 'Plano padrão não encontrado' };
    }

    // Criar clínica automática APENAS se não for membro de nenhuma clínica
    const clinicName = `${doctor.name} Clinic`;
    const clinicSlug = await generateUniqueSlugForClinic(clinicName);
    
    const clinic = await prisma.clinic.create({
      data: {
        name: clinicName,
        description: `Personal clinic of ${doctor.name}`,
        slug: clinicSlug,
        ownerId: doctorId
      }
    });

    // Criar subscription trial para a clínica
    const now = new Date();
    const trialDays = defaultPlan.trialDays;
    const trialEnd = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
    
    await prisma.$executeRaw`
      INSERT INTO clinic_subscriptions (
        id,
        clinic_id,
        plan_id,
        status,
        start_date,
        trial_ends_at,
        current_period_start,
        current_period_end,
        current_doctors_count,
        current_patients_count,
        created_at,
        updated_at
      ) VALUES (
        ${`cs_${clinic.id}-trial`},
        ${clinic.id},
        ${defaultPlan.id},
        'TRIAL',
        ${now},
        ${trialEnd},
        ${now},
        ${trialEnd},
        1,
        0,
        ${now},
        ${now}
      )
    `;

    // Adicionar o médico como membro da própria clínica
    await prisma.clinicMember.create({
      data: {
        clinicId: clinic.id,
        userId: doctorId,
        role: 'ADMIN'
      }
    });

    // Buscar clínica completa para retornar
    const fullClinic = await getUserClinic(doctorId);

    return { 
      success: true, 
      clinic: fullClinic, 
      message: 'Clínica criada automaticamente com sucesso' 
    };

  } catch (error) {
    console.error('Erro ao garantir clínica para médico:', error);
    return { success: false, message: 'Erro interno do servidor' };
  }
}

/**
 * Obter estatísticas da clínica
 */
export async function getClinicStats(clinicId: string) {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    include: {
      members: {
        where: { isActive: true },
        include: { user: true }
      }
    }
  });

  if (!clinic) return null;

  const memberIds = clinic.members.map(m => m.user.id);

  const [protocolCount, patientCount, courseCount] = await Promise.all([
    prisma.protocol.count({
      where: { doctor_id: { in: memberIds } }
    }),
    prisma.user.count({
      where: {
        role: 'PATIENT',
        doctor_id: { in: memberIds }
      }
    }),
    prisma.course.count({
      where: { doctorId: { in: memberIds } }
    })
  ]);

  return {
    totalDoctors: clinic.members.length,
    totalProtocols: protocolCount,
    totalPatients: patientCount,
    totalCourses: courseCount
  };
}

// Função para gerar slug a partir do nome
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^a-z0-9\s-]/g, '') // Remove caracteres especiais
    .replace(/\s+/g, '-') // Substitui espaços por hífens
    .replace(/-+/g, '-') // Remove hífens duplicados
    .replace(/^-|-$/g, ''); // Remove hífens do início e fim
}

// Função para garantir slug único
export async function ensureUniqueSlug(baseSlug: string, excludeId?: string): Promise<string> {
  let slug = baseSlug;
  let counter = 1;
  
  while (true) {
    const existing = await prisma.clinic.findFirst({
      where: {
        slug: slug,
        ...(excludeId && { id: { not: excludeId } })
      }
    });
    
    if (!existing) {
      return slug;
    }
    
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
}

// Função para gerar slug único para uma clínica
export async function generateUniqueSlugForClinic(name: string, excludeId?: string): Promise<string> {
  const baseSlug = generateSlug(name);
  return await ensureUniqueSlug(baseSlug, excludeId);
} 