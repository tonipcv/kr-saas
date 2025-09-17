import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const resolved = await params;
    const slug = resolved.slug;

    // Extrair código de indicação da URL
    const { searchParams } = new URL(request.url);
    const referrerCode = searchParams.get('code');

    // Buscar informações do médico por slug
    let doctor = await prisma.user.findFirst({
      where: {
        doctor_slug: { equals: slug, mode: 'insensitive' },
        role: 'DOCTOR'
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        doctor_slug: true,
        form_settings: {
          select: {
            title: true
          }
        }
      }
    });

    // Suporte a páginas de clínica: quando slug é de clínica, mapear para o médico (owner ou membro)
    if (!doctor) {
      try {
        const rows = await prisma.$queryRaw<{ id: string; ownerId: string | null }[]>`
          SELECT id, "ownerId" FROM clinics
          WHERE slug = ${slug} OR "subdomain" = ${slug}
          LIMIT 1
        `;
        const clinic = rows && rows[0] ? rows[0] : null;
        if (clinic?.ownerId) {
          const owner = await prisma.user.findFirst({
            where: { id: clinic.ownerId, role: 'DOCTOR' } as any,
            select: { id: true, name: true, email: true, image: true, doctor_slug: true, form_settings: { select: { title: true } } },
          });
          if (owner) doctor = owner as any;
        }
        if (!doctor && clinic) {
          const member = await prisma.clinicMember.findFirst({
            where: { clinicId: clinic.id, isActive: true, user: { role: 'DOCTOR' } } as any,
            include: { user: { select: { id: true, name: true, email: true, image: true, doctor_slug: true, form_settings: { select: { title: true } } } } },
          });
          if (member?.user) doctor = member.user as any;
        }
      } catch {}

      if (!doctor) {
        const hyphenToSpace = slug.replace(/-/g, ' ');
        const suggestions = await prisma.user.findMany({
          where: {
            role: 'DOCTOR',
            OR: [
              { doctor_slug: { contains: slug, mode: 'insensitive' } },
              { name: { contains: hyphenToSpace, mode: 'insensitive' } },
            ],
          },
          select: { doctor_slug: true, name: true },
          take: 3,
        });

        return NextResponse.json(
          {
            error: 'Médico/Clínica não encontrado(a) para o slug informado.',
            requested_slug: slug,
            suggestions,
            hint:
              'Verifique se o médico possui um Public Slug salvo em /doctor/profile ou se o slug da clínica está correto. O match é case-insensitive.',
          },
          { status: 404 }
        );
      }
    }

    // Buscar informações do paciente que está indicando (se houver código)
    let referrer: { name: string } | null = null;
    if (referrerCode) {
      const referrerUser = await prisma.user.findFirst({
        where: { referral_code: referrerCode },
        select: { name: true }
      });
      
      if (referrerUser) {
        referrer = {
          name: referrerUser.name as string
        };
      }
    }

    // Buscar estatísticas básicas (pacientes atendidos):
    // contar pacientes distintos com prescrições de protocolos deste médico
    const totalPatients = await prisma.protocolPrescription
      .groupBy({
        by: ['user_id'],
        where: {
          protocol: { doctor_id: doctor.id },
        },
      })
      .then((groups) => groups.length);

    return NextResponse.json({
      doctor: {
        id: doctor.id,
        name: doctor.name,
        email: doctor.email,
        image: doctor.image
      },
      doctor_slug: doctor.doctor_slug,
      stats: {
        totalPatients: totalPatients
      },
      referrer,
      settings: {
        title_page: doctor.form_settings?.title ?? null
      }
    });

  } catch (error) {
    console.error('Erro ao buscar informações do médico por slug:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
