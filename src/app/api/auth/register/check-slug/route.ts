import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get('slug');

    if (!slug) {
      return NextResponse.json(
        { message: "Slug é obrigatório" },
        { status: 400 }
      );
    }

    // Verificar se o slug já está em uso
    const existingClinic = await prisma.clinic.findFirst({
      where: {
        slug: slug.toLowerCase().trim()
      }
    });

    return NextResponse.json({
      available: !existingClinic,
      message: existingClinic ? "Slug já está em uso" : "Slug disponível"
    });
  } catch (error) {
    console.error("Slug check error:", error);
    return NextResponse.json(
      { message: "Erro ao verificar disponibilidade do slug" },
      { status: 500 }
    );
  }
}
