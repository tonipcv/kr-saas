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
        verified: boolean,
        // optional business fields carried from slug step
        country?: string | null,
        monthlyRevenue?: string | null,
        currentGateway?: string | null,
        businessPhone?: string | null,
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
    const countryFromToken = (decodedToken as any).country || null;
    const monthlyRevenueFromToken = (decodedToken as any).monthlyRevenue || null;
    const currentGatewayFromToken = (decodedToken as any).currentGateway || null;
    const businessPhoneFromToken = (decodedToken as any).businessPhone || null;

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

    // Buscar plano Free como padrão via Prisma (sem tabelas legadas)
    const resolveFreePlanId = async (): Promise<string | null> => {
      try {
        const free = await prisma.clinicPlan.findFirst({
          where: {
            isActive: true,
            name: { equals: 'Free', mode: 'insensitive' }
          },
          select: { id: true }
        });
        return free?.id ?? null;
      } catch {
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
            ...(countryFromToken ? { country: countryFromToken } : {}),
            ...(monthlyRevenueFromToken ? { monthlyRevenueRange: monthlyRevenueFromToken } : {}),
            ...(currentGatewayFromToken ? { currentGateway: currentGatewayFromToken } : {}),
            ...(businessPhoneFromToken ? { phone: businessPhoneFromToken } : {}),
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
            ...(countryFromToken ? { country: countryFromToken } : {}),
            ...(monthlyRevenueFromToken ? { monthlyRevenueRange: monthlyRevenueFromToken } : {}),
            ...(currentGatewayFromToken ? { currentGateway: currentGatewayFromToken } : {}),
            ...(businessPhoneFromToken ? { phone: businessPhoneFromToken } : {}),
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

    // Criar assinatura padrão usando ClinicSubscription (se houver plano)
    if (freePlanId) {
      try {
        const existingActive = await prisma.clinicSubscription.findFirst({
          where: { clinicId: clinic.id, status: { in: ['ACTIVE', 'TRIAL'] } },
          select: { id: true }
        });
        if (!existingActive) {
          await prisma.clinicSubscription.create({
            data: {
              id: `cs_${clinic.id}-${now.getTime()}`,
              clinicId: clinic.id,
              planId: freePlanId,
              status: trialEnd ? 'TRIAL' : 'ACTIVE',
              startDate: now,
              currentPeriodStart: now,
              currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
              trialEndsAt: trialEnd,
              currentDoctorsCount: 1,
              currentPatientsCount: 0
            }
          });
        }
      } catch {
        // Ignorar erro de criação de assinatura e prosseguir com cadastro
      }
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
