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
    const subdomainFromToken = decodedToken.subdomain || decodedToken.slug; // preferir subdomain

    if (!clinicNameFromToken) {
      return NextResponse.json(
        { message: "Nome da clínica é obrigatório" },
        { status: 400 }
      );
    }

    // Slug handling simplified: use provided subdomain as both slug and subdomain when available

    // Verificar se o email já está em uso
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    // Buscar (ou criar) plano Free como padrão (tolerante a ausência de tabela)
    const resolveFreePlanId = async (): Promise<string | null> => {
      try {
        const rows = await prisma.$queryRawUnsafe<any[]>(
          `SELECT id FROM subscription_plans WHERE LOWER(name) = 'free' LIMIT 1`
        );
        if (rows && rows[0]?.id) return rows[0].id as string;
        const newId = uuidv4();
        // Tentar criar um plano mínimo "Free" (se a tabela existir)
        try {
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
        } catch (e) {
          // Tabela pode não existir; seguir sem plano explícito
          return null;
        }
      } catch (e) {
        // Tabela pode não existir; seguir sem plano explícito
        return null;
      }
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
            isActive: true,
            ...(subdomainFromToken ? { subdomain: subdomainFromToken, slug: subdomainFromToken } : {}),
          }
        });
      } catch {
        // Fallback SQL
        if (subdomainFromToken) {
          await prisma.$executeRawUnsafe(
            `UPDATE clinics SET name = $1, "isActive" = $2, slug = $3, subdomain = $3, "updatedAt" = NOW() WHERE id = $4`,
            clinicNameFromToken, true, subdomainFromToken, existingClinicForOwner.id
          );
        } else {
          await prisma.$executeRawUnsafe(
            `UPDATE clinics SET name = $1, "isActive" = $2, "updatedAt" = NOW() WHERE id = $3`,
            clinicNameFromToken, true, existingClinicForOwner.id
          );
        }
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
            ownerId: doctor.id,
            isActive: true,
            ...(subdomainFromToken ? { subdomain: subdomainFromToken, slug: subdomainFromToken } : {}),
          }
        });
      } catch {
        if (subdomainFromToken) {
          await prisma.$executeRawUnsafe(
            `INSERT INTO clinics (id, name, slug, subdomain, "ownerId", "isActive", "createdAt", "updatedAt") VALUES ($1, $2, $3, $3, $4, $5, NOW(), NOW())`,
            clinicId, clinicNameFromToken, subdomainFromToken, doctor.id, true
          );
        } else {
          await prisma.$executeRawUnsafe(
            `INSERT INTO clinics (id, name, "ownerId", "isActive", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, NOW(), NOW())`,
            clinicId, clinicNameFromToken, doctor.id, true
          );
        }
        const row = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM clinics WHERE id = $1`, clinicId);
        clinic = row && row[0] ? row[0] : { id: clinicId };
      }
    }

    // Definir trial (padrão 14 dias) se solicitado; caso contrário, ativa direto
    const resolvedTrialDays = typeof trialDays === 'number' ? Math.max(0, Math.min(60, trialDays)) : 14;
    const now = new Date();
    const trialEnd = resolvedTrialDays > 0 ? new Date(now.getTime() + resolvedTrialDays * 24 * 60 * 60 * 1000) : null;

    // Criar assinatura Free (legado) - nível CLÍNICA via SQL; tolera plan_id nulo quando tabela de planos não existe
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
