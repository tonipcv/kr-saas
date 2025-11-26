import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verify, sign } from "jsonwebtoken";

// Use the same secret resolution as the verify endpoint to avoid signature mismatches
const SECRET_KEY = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET || "your-secret-key";

export async function POST(req: Request) {
  try {
    const {
      email,
      token,
      clinicName,
      subdomain,
      businessPhone,
      monthlyRevenue,
      currentGateway,
      country,
    } = await req.json();

    if (!email || !token || !clinicName || !subdomain || !country) {
      return NextResponse.json(
        { message: "Email, token, nome da clínica, subdomínio e país são obrigatórios" },
        { status: 400 }
      );
    }

    // Verificar o token
    try {
      const decoded = verify(token, SECRET_KEY) as { email: string, verified: boolean };
      const normalizedEmail = (email as string).toLowerCase().trim();
      if (decoded.email.toLowerCase().trim() !== normalizedEmail || !decoded.verified) {
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

    // Armazenar temporariamente clinicName e subdomain para etapa final
    const registrationToken = sign(
      {
        email,
        clinicName,
        subdomain,
        // Optional extra fields to be used on account creation step
        businessPhone: businessPhone || null,
        monthlyRevenue: monthlyRevenue || null,
        currentGateway: currentGateway || null,
        country: country || null,
        verified: true,
        exp: Math.floor(Date.now() / 1000) + 60 * 30 // 30 minutos
      },
      SECRET_KEY
    );

    return NextResponse.json({
      message: "Dados da clínica salvos com sucesso",
      token: registrationToken
    });
  } catch (error) {
    console.error("Clinic info save error:", error);
    return NextResponse.json(
      { message: "Erro ao salvar dados da clínica" },
      { status: 500 }
    );
  }
}
