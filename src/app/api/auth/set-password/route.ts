import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    const { token, password } = await req.json();

    if (!token || !password) {
      return NextResponse.json(
        { message: "Token e senha são obrigatórios" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { message: "A senha deve ter pelo menos 6 caracteres" },
        { status: 400 }
      );
    }

    // Hash the token to compare with stored hash
    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    // Find user with valid invite token
    const user = await prisma.user.findFirst({
      where: {
        reset_token: hashedToken,
        reset_token_expiry: {
          gt: new Date()
        },
        // Allow both doctors and patients to use this endpoint
        role: {
          in: ['DOCTOR', 'PATIENT']
        }
      }
    });

    if (!user) {
      return NextResponse.json(
        { message: "Token de convite inválido ou expirado" },
        { status: 400 }
      );
    }

    // Hash the new password
    const hashedPassword = await hash(password, 12);

    // Update user's password, verify email, and clear invite token
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        email_verified: new Date(), // Verificar email automaticamente
        reset_token: null,
        reset_token_expiry: null
      }
    });

    return NextResponse.json(
      { message: "Senha definida com sucesso! Você já pode fazer login.", email: updated.email },
      { status: 200 }
    );
  } catch (error) {
    console.error("Set password error:", error);
    return NextResponse.json(
      { message: "Erro ao definir a senha" },
      { status: 500 }
    );
  }
} 