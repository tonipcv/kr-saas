import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verify, sign } from "jsonwebtoken";

// Chave secreta para verificar e assinar tokens
const SECRET_KEY = process.env.JWT_SECRET || "your-secret-key";

export async function POST(req: Request) {
  try {
    const { email, token, slug } = await req.json();

    if (!email || !token || !slug) {
      return NextResponse.json(
        { message: "Email, token e slug são obrigatórios" },
        { status: 400 }
      );
    }

    // Verificar o token
    try {
      const decoded = verify(token, SECRET_KEY) as { email: string, verified: boolean };
      
      if (decoded.email !== email || !decoded.verified) {
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

    const normalizedSlug = slug.toLowerCase().trim();

    // Verificar se o slug já está em uso
    const existingClinic = await prisma.clinic.findFirst({
      where: {
        slug: normalizedSlug
      }
    });

    if (existingClinic) {
      return NextResponse.json(
        { message: "Este slug já está em uso" },
        { status: 400 }
      );
    }

    // Armazenar temporariamente o slug para uso na etapa final
    const registrationToken = sign(
      { 
        email,
        slug: normalizedSlug,
        verified: true,
        exp: Math.floor(Date.now() / 1000) + 60 * 30 // 30 minutos
      },
      SECRET_KEY
    );

    return NextResponse.json({
      message: "Slug salvo com sucesso",
      token: registrationToken
    });
  } catch (error) {
    console.error("Slug save error:", error);
    return NextResponse.json(
      { message: "Erro ao salvar slug" },
      { status: 500 }
    );
  }
}
