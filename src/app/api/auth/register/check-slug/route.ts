import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    // Slug checking disabled in simplified registration flow
    return NextResponse.json({ available: true, message: 'Slug check disabled' });
  } catch (error) {
    console.error("Slug check error:", error);
    return NextResponse.json(
      { message: "Erro ao verificar disponibilidade do slug" },
      { status: 500 }
    );
  }
}
