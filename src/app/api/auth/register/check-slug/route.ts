import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    // Novo parâmetro: subdomain. Mantemos compatibilidade com 'slug' tratando-o como subdomínio se enviado
    const subdomainParam = url.searchParams.get('subdomain') || url.searchParams.get('slug');

    if (!subdomainParam) {
      return NextResponse.json(
        { message: "Subdomínio é obrigatório" },
        { status: 400 }
      );
    }

    const subdomain = subdomainParam.toLowerCase().trim();

    let existingClinic: any = null;
    try {
      // Tentativa padrão via Prisma (requer client atualizado com campo subdomain)
      existingClinic = await prisma.clinic.findFirst({
        where: {
          OR: [
            { subdomain },
            { slug: subdomain }
          ]
        }
      });
    } catch (e: any) {
      // Fallback robusto: SQL direto em caso de Prisma Client desatualizado
      // (coluna já existe no banco, mas o processo não reiniciou após generate)
      console.warn('[check-slug] Prisma findFirst failed, falling back to raw SQL:', e?.message || e);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT id FROM clinics WHERE subdomain = $1 OR slug = $1 LIMIT 1`,
        subdomain
      );
      existingClinic = rows && rows[0] ? rows[0] : null;
    }

    return NextResponse.json({
      available: !existingClinic,
      message: existingClinic ? "Subdomínio já está em uso" : "Subdomínio disponível"
    });
  } catch (error) {
    console.error("Subdomain check error:", error);
    return NextResponse.json(
      { message: "Erro ao verificar disponibilidade do subdomínio" },
      { status: 500 }
    );
  }
}
