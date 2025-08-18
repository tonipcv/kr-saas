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

    // Buscar plano padrão para médicos
    const defaultPlan = await prisma.subscriptionPlan.findFirst({
      where: { isDefault: true }
    });

    if (!defaultPlan) {
      return NextResponse.json(
        { message: "Plano padrão não encontrado" },
        { status: 500 }
      );
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

    // Criar assinatura trial
    await prisma.unified_subscriptions.create({
      data: {
        id: uuidv4(), // Gerando ID para a assinatura
        type: 'DOCTOR',
        subscriber_id: doctor.id,
        plan_id: defaultPlan.id,
        status: 'TRIAL',
        start_date: new Date(),
        trial_end_date: new Date(Date.now() + (defaultPlan.trialDays || 7) * 24 * 60 * 60 * 1000),
        auto_renew: true
      }
    });

    return NextResponse.json({
      message: "Cadastro concluído com sucesso. Seu período de trial de 7 dias foi ativado.",
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
