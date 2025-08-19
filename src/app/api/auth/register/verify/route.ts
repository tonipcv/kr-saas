import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sign } from "jsonwebtoken";
import { cookies } from "next/headers";
import { compare } from "bcryptjs";

// Chave secreta para assinar tokens de autenticação compatíveis com NextAuth
const SECRET_KEY = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET || "your-secret-key";

export async function POST(req: Request) {
  try {
    const { email, code, existingUser } = await req.json();
    const cookieStore = await cookies(); // Next.js 15: cookies() é assíncrono

    if (!email || !code) {
      return NextResponse.json(
        { message: "Email e código são obrigatórios" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Verificar o código
    const verificationToken = await prisma.verificationToken.findUnique({
      where: {
        identifier_token: {
          identifier: normalizedEmail,
          token: code
        }
      }
    });

    if (!verificationToken) {
      return NextResponse.json(
        { message: "Código de verificação inválido" },
        { status: 400 }
      );
    }

    if (verificationToken.expires < new Date()) {
      // Remover token expirado
      await prisma.verificationToken.delete({
        where: {
          identifier_token: {
            identifier: normalizedEmail,
            token: code
          }
        }
      });

      return NextResponse.json(
        { message: "Código de verificação expirado" },
        { status: 400 }
      );
    }

    // Remover o token usado
    await prisma.verificationToken.delete({
      where: {
        identifier_token: {
          identifier: normalizedEmail,
          token: code
        }
      }
    });

    // Verificar se é um usuário existente tentando fazer login
    if (existingUser) {
      // Buscar o usuário no banco de dados
      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        include: {
          owned_clinics: true // Usando o nome correto da relação conforme o schema
        }
      });

      if (!user) {
        return NextResponse.json(
          { message: "Usuário não encontrado" },
          { status: 404 }
        );
      }

      // Criar token de autenticação (compatível com auth.ts)
      const token = sign(
        { 
          id: user.id,
          email: user.email,
          role: user.role,
          exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 // 7 dias
        },
        SECRET_KEY
      );

      // Definir cookie de autenticação
      cookieStore.set({
        name: "token",
        value: token,
        httpOnly: true,
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 7 // 7 dias
      });

      return NextResponse.json({
        message: "Login realizado com sucesso",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          clinicId: user.owned_clinics[0]?.id
        },
        token
      });
    } else {
      // Fluxo normal de verificação para novos usuários
      // Criar um token temporário para as próximas etapas
      const tempToken = sign(
        { 
          email: normalizedEmail,
          verified: true,
          exp: Math.floor(Date.now() / 1000) + 60 * 30 // 30 minutos
        },
        SECRET_KEY
      );

      return NextResponse.json({
        message: "Código verificado com sucesso",
        token: tempToken
      });
    }
  } catch (error) {
    console.error("Verification error:", error);
    return NextResponse.json(
      { message: "Erro ao verificar código" },
      { status: 500 }
    );
  }
}
