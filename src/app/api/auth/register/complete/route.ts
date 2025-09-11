import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verify } from "jsonwebtoken";
import { hash } from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

// Chave secreta para verificar tokens (alinha com verify: NEXTAUTH_SECRET || JWT_SECRET)
const SECRET_KEY = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET || "your-secret-key";

export async function POST(req: Request) {
  try {
    const { email, token, name, password, planName, trialDays } = await req.json();

    if (!email || !token || !password) {
      return NextResponse.json(
        { message: "Email, token e password são obrigatórios" },
        { status: 400 }
      );
    }

    // Verificar o token
    let decodedToken;
    try {
      decodedToken = verify(token, SECRET_KEY) as { 
        email: string,
        clinicName?: string,
        subdomain?: string,
        slug?: string, // compat
        verified: boolean 
      };
      const normalizedEmail = (email as string).toLowerCase().trim();
      if (decodedToken.email.toLowerCase().trim() !== normalizedEmail || !decodedToken.verified) {
        return NextResponse.json(
          { message: "Token inválido" },
          { status: 401 }
        );
      }
    } catch (err) {
      return NextResponse.json(
        { message: "Token inválido ou expirado" },
        { status: 401 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const clinicNameFromToken = decodedToken.clinicName || name; // fallback para compatibilidade
    const subdomain = (decodedToken.subdomain || '').toLowerCase().trim() || null;

    if (!clinicNameFromToken) {
      return NextResponse.json(
        { message: "Nome da clínica é obrigatório" },
        { status: 400 }
      );
    }

    // Gerar slug automaticamente a partir do clinicName
    const baseSlug = clinicNameFromToken
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 255);

    // Garantir unicidade do slug (com fallback SQL e limite de tentativas)
    const slugExists = async (candidate: string): Promise<boolean> => {
      try {
        const found = await prisma.clinic.findFirst({
          where: { OR: [{ slug: candidate }, { /* subdomain may not be known by client */ } as any] }
        });
        if (found) return true;
      } catch {
        // ignore
      }
      // Fallback cru que cobre slug e subdomain
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT 1 FROM clinics WHERE slug = $1 OR subdomain = $1 LIMIT 1`, candidate
      );
      return Array.isArray(rows) && rows.length > 0;
    };

    let finalSlug = baseSlug || `clinic-${Date.now()}`;
    let suffix = 1;
    let attempts = 0;
    const MAX_ATTEMPTS = 50;
    while (attempts < MAX_ATTEMPTS && (await slugExists(finalSlug))) {
      finalSlug = `${baseSlug}-${suffix++}`.slice(0, 255);
      attempts++;
    }

    // Verificar se o email já está em uso
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    // Buscar (ou criar) plano Free como padrão (via SQL para compatibilidade)
    const resolveFreePlanId = async (): Promise<string> => {
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT id FROM subscription_plans WHERE LOWER(name) = 'free' LIMIT 1`
      );
      if (rows && rows[0]?.id) return rows[0].id as string;
      const newId = uuidv4();
      // Tentar criar um plano mínimo "Free" com defaults seguros
      await prisma.$executeRawUnsafe(
        `INSERT INTO subscription_plans (id, name, description, price, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
        newId,
        'Free',
        'Plano gratuito padrão (auto-criado)',
        0,
        true
      );
      return newId;
    };
    const freePlanId = await resolveFreePlanId();

    // Hash da senha
    const hashedPassword = await hash(password, 12);

    // Criar/atualizar médico
    let doctorId = existingUser?.id || uuidv4();
    let doctor;
    if (existingUser) {
      doctor = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          name: clinicNameFromToken,
          password: hashedPassword,
          role: 'DOCTOR',
          is_active: true as any,
          email_verified: new Date(),
          updated_at: new Date() as any
        }
      });
    } else {
      doctor = await prisma.user.create({
        data: {
          id: doctorId,
          name: clinicNameFromToken,
          email: normalizedEmail,
          password: hashedPassword,
          role: 'DOCTOR',
          email_verified: new Date(), // Email já verificado pelo fluxo anterior
        }
      });
    }

    // Criar/atualizar clínica do owner (evitar colisão de ID)
    // 1) Tentar localizar clínica existente do owner
    let existingClinicForOwner: any = null;
    try {
      existingClinicForOwner = await prisma.clinic.findFirst({ where: { ownerId: doctor.id } });
    } catch {
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT id FROM clinics WHERE "ownerId" = $1 LIMIT 1`, doctor.id
      );
      existingClinicForOwner = rows && rows[0] ? rows[0] : null;
    }

    let clinic: any = null;
    if (existingClinicForOwner) {
      // Atualiza clínica existente
      try {
        clinic = await prisma.clinic.update({
          where: { id: existingClinicForOwner.id },
          data: {
            name: clinicNameFromToken,
            slug: finalSlug,
            subdomain: subdomain ?? undefined,
            isActive: true
          }
        });
      } catch {
        // Fallback SQL
        await prisma.$executeRawUnsafe(
          `UPDATE clinics SET name = $1, slug = $2, subdomain = $3, "isActive" = $4, "updatedAt" = NOW() WHERE id = $5`,
          clinicNameFromToken, finalSlug, subdomain ?? null, true, existingClinicForOwner.id
        );
        const row = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM clinics WHERE id = $1`, existingClinicForOwner.id);
        clinic = row && row[0] ? row[0] : { id: existingClinicForOwner.id };
      }
    } else {
      // Cria clínica com novo ID (não usar o mesmo do user para evitar conflito)
      const clinicId = uuidv4();
      try {
        clinic = await prisma.clinic.create({
          data: {
            id: clinicId,
            name: clinicNameFromToken,
            slug: finalSlug,
            subdomain: subdomain ?? undefined,
            ownerId: doctor.id,
            isActive: true
          }
        });
      } catch {
        await prisma.$executeRawUnsafe(
          `INSERT INTO clinics (id, name, slug, subdomain, "ownerId", "isActive", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
          clinicId, clinicNameFromToken, finalSlug, subdomain ?? null, doctor.id, true
        );
        const row = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM clinics WHERE id = $1`, clinicId);
        clinic = row && row[0] ? row[0] : { id: clinicId };
      }
    }

    // Definir trial (padrão 14 dias) se solicitado; caso contrário, ativa direto
    const resolvedTrialDays = typeof trialDays === 'number' ? Math.max(0, Math.min(60, trialDays)) : 14;
    const now = new Date();
    const trialEnd = resolvedTrialDays > 0 ? new Date(now.getTime() + resolvedTrialDays * 24 * 60 * 60 * 1000) : null;

    // Criar assinatura Free (legado) - nível CLÍNICA via SQL para evitar incompatibilidades de client
    // Evitar duplicar assinatura se já existir alguma ativa/trial
    const legacySub = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM unified_subscriptions 
       WHERE type::text = 'CLINIC' 
         AND subscriber_id = $1 
         AND status::text IN ('ACTIVE','TRIAL') 
       LIMIT 1`,
      clinic.id
    );
    if (!legacySub || !legacySub[0]) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO unified_subscriptions (
           id, type, subscriber_id, plan_id, status, start_date, end_date, trial_end_date, auto_renew, created_at, updated_at
         ) VALUES (
           $1, $2::subscription_type, $3, $4, $5::subscription_status, $6, $7, $8, $9, NOW(), NOW()
         )`,
        uuidv4(),
        'CLINIC',
        clinic.id,
        freePlanId,
        'ACTIVE',
        now,
        null,
        trialEnd,
        true
      );
    }

    return NextResponse.json({
      message: `Cadastro concluído com sucesso. Plano Free ${resolvedTrialDays > 0 ? `com ${resolvedTrialDays} dias de teste` : 'ativado'} .`,
      doctorId: doctor.id,
      clinicId: clinic.id
    });
  } catch (error) {
    console.error("Registration completion error:", error);
    
    // Garantir que o erro seja convertido para string de forma segura
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return NextResponse.json(
      { message: "Erro ao finalizar cadastro", error: errorMessage },
      { status: 500 }
    );
  }
}
