import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/v2/doctor-link/[slug]
 * Busca informações do médico pelo slug
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    if (!slug) {
      return NextResponse.json(
        { success: false, message: 'Slug não fornecido' },
        { status: 400 }
      );
    }

    // 1) Tentar como slug de médico (user.doctor_slug)
    let doctor = await prisma.user.findFirst({
      where: {
        doctor_slug: slug,
        role: 'DOCTOR'
      },
      select: {
        id: true,
        name: true,
        image: true,
        email: true
      }
    });
    const debug: Record<string, any> = {
      slug,
      triedDoctorSlug: true,
      doctorByDoctorSlugFound: Boolean(doctor),
    };

    // 2) Se não achou, tentar como slug de clínica: pegar owner ou algum membro médico ativo
    if (!doctor) {
      // Resolve clinic by slug OR subdomain via raw SQL (schema may not have subdomain typed)
      let clinic: { id: string; ownerId: string | null } | null = null;
      try {
        const rows = await prisma.$queryRaw<{ id: string; ownerId: string | null }[]>`
          SELECT id, "ownerId" FROM clinics WHERE slug = ${slug} OR "subdomain" = ${slug} LIMIT 1
        `;
        clinic = rows && rows[0] ? rows[0] : null;
      } catch {}

      debug.triedClinicSlug = true;
      debug.clinicFound = Boolean(clinic);

      if (clinic) {
        // Owner primeiro
        if (clinic.ownerId) {
          const owner = await prisma.user.findFirst({
            where: { id: clinic.ownerId, role: 'DOCTOR' },
            select: { id: true, name: true, image: true, email: true }
          });
          debug.ownerTried = true;
          debug.ownerFound = Boolean(owner);
          if (owner) {
            doctor = owner;
          }
        }

        // Se não houver owner válido, procurar um membro médico ativo
        if (!doctor) {
          const member = await prisma.clinicMember.findFirst({
            where: { clinicId: clinic.id, isActive: true, user: { role: 'DOCTOR' } },
            include: { user: { select: { id: true, name: true, image: true, email: true } } }
          });
          debug.memberTried = true;
          debug.memberFound = Boolean(member?.user);
          if (member?.user) {
            doctor = member.user as typeof doctor;
          }
        }
      }
    }

    if (!doctor) {
      console.warn('[doctor-link] Médico não encontrado', debug);
      return NextResponse.json(
        { success: false, message: 'Médico não encontrado', debug },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: doctor
    });
  } catch (error) {
    console.error('Erro ao buscar médico por slug:', error);
    return NextResponse.json(
      { success: false, message: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
