import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verify, sign } from "jsonwebtoken";

// Use the same secret resolution as the verify endpoint to avoid signature mismatches
const SECRET_KEY = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET || "your-secret-key";

export async function POST(req: Request) {
  try {
    const { email, token, clinicName, subdomain } = await req.json();

    if (!email || !token || !clinicName || !subdomain) {
      return NextResponse.json(
        { message: "Email, token, nome da clínica e subdomínio são obrigatórios" },
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

    const normalizedSub = (subdomain as string).toLowerCase().trim();

    // Verificar se o subdomínio já está em uso (ou conflita com slug existente)
    let existingClinic: any = null;
    try {
      existingClinic = await prisma.clinic.findFirst({
        where: {
          OR: [
            { subdomain: normalizedSub },
            { slug: normalizedSub },
          ]
        }
      });
    } catch (e: any) {
      // Fallback para SQL cru se o client não estiver atualizado ainda
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT id FROM clinics WHERE subdomain = $1 OR slug = $1 LIMIT 1`,
        normalizedSub
      );
      existingClinic = rows && rows[0] ? rows[0] : null;
    }

    if (existingClinic) {
      return NextResponse.json(
        { message: "Este subdomínio já está em uso" },
        { status: 400 }
      );
    }

    // Armazenar temporariamente clinicName e subdomain para etapa final
    const registrationToken = sign(
      { 
        email,
        clinicName,
        subdomain: normalizedSub,
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
