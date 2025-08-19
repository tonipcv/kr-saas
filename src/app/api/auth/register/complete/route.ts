import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verify } from "jsonwebtoken";
import { hash } from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

// Chave secreta para verificar tokens
const SECRET_KEY = process.env.JWT_SECRET || "your-secret-key";

export async function POST(req: Request) {
  try {
    const { email, token, name, password } = await req.json();

    if (!email || !token || !name || !password) {
      return NextResponse.json(
        { message: "Todos os campos são obrigatórios" },
        { status: 400 }
      );
    }

    // Verificar o token
    let decodedToken;
    try {
      decodedToken = verify(token, SECRET_KEY) as { 
        email: string, 
        slug: string, 
        verified: boolean 
      };
      
      if (decodedToken.email !== email || !decodedToken.verified) {
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
    const slug = decodedToken.slug;

    // Verificar se o email já está em uso
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (existingUser) {
      return NextResponse.json(
        { message: "Este email já está em uso" },
        { status: 400 }
      );
    }

    // Buscar (ou criar) plano Free como padrão
    let freePlan = await prisma.subscriptionPlan.findFirst({
      where: { name: { equals: 'Free', mode: 'insensitive' } }
    });

    if (!freePlan) {
      freePlan = await prisma.subscriptionPlan.create({
        data: {
          name: 'Free',
          description: 'Plano gratuito padrão para novos médicos',
          price: 0,
          billingCycle: 'MONTHLY',
          maxDoctors: 1,
          features: 'Auto-created by register complete API',
          isActive: true,
          maxPatients: 50,
          maxProtocols: 10,
          maxCourses: 5,
          maxProducts: 100,
          isDefault: true,
          trialDays: 0,
        }
      });
    }

    // Hash da senha
    const hashedPassword = await hash(password, 12);
    
    // Gerar ID único para o usuário
    const userId = uuidv4();

    // Criar médico
    const doctor = await prisma.user.create({
      data: {
        id: userId,
        name,
        email: normalizedEmail,
        password: hashedPassword,
        role: 'DOCTOR',
        email_verified: new Date(), // Email já verificado pelo fluxo anterior
      }
    });

    // Criar clínica com o slug definido
    const clinic = await prisma.clinic.create({
      data: {
        name: `Clínica ${name}`,
        slug,
        ownerId: doctor.id, // Usando ownerId conforme definido no schema
        isActive: true      // Usando camelCase conforme definido no schema
      }
    });

    // Criar assinatura Free (ativa e sem expiração)
    await prisma.unified_subscriptions.create({
      data: {
        id: uuidv4(),
        type: 'DOCTOR',
        subscriber_id: doctor.id,
        plan_id: freePlan.id,
        status: 'ACTIVE',
        start_date: new Date(),
        end_date: null,
        trial_end_date: null,
        auto_renew: true
      }
    });

    return NextResponse.json({
      message: "Cadastro concluído com sucesso. Plano Free ativado.",
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
