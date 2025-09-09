import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    // Validar slug
    if (!slug || typeof slug !== 'string') {
      return NextResponse.json(
        { error: 'Invalid slug parameter' },
        { status: 400 }
      );
    }

    // Sanitizar slug (apenas letras, números e hífens)
    const sanitizedSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '');
    
    if (sanitizedSlug !== slug.toLowerCase()) {
      return NextResponse.json(
        { error: 'Invalid slug format' },
        { status: 400 }
      );
    }

    // Buscar clínica por slug OU subdomínio (via SQL raw para evitar tipagem do Prisma)
    let clinic: { id: string; name: string | null; slug: string | null; logo: string | null; description: string | null; website: string | null; city: string | null; state: string | null; ownerId: string | null } | null = null;
    try {
      const rows = await prisma.$queryRaw<{ id: string; name: string | null; slug: string | null; logo: string | null; description: string | null; website: string | null; city: string | null; state: string | null; ownerId: string | null }[]>`
        SELECT id, name, slug, logo, description, website, city, state, "ownerId"
        FROM clinics
        WHERE (slug = ${sanitizedSlug} OR "subdomain" = ${sanitizedSlug}) AND "isActive" = true
        LIMIT 1
      `;
      clinic = rows && rows[0] ? rows[0] : null;
    } catch {}

    if (!clinic) {
      // Fallback: try resolving by doctor slug (owner clinic)
      try {
        const doctor = await prisma.user.findFirst({
          where: { doctor_slug: sanitizedSlug, role: 'DOCTOR' } as any,
          select: { id: true }
        });
        if (doctor) {
          // 2a) Try clinic owned by the doctor
          const owned = await prisma.$queryRaw<{ id: string; name: string | null; slug: string | null; logo: string | null; description: string | null; website: string | null; city: string | null; state: string | null; ownerId: string | null }[]>`
            SELECT id, name, slug, logo, description, website, city, state, "ownerId"
            FROM clinics
            WHERE "ownerId" = ${doctor.id} AND "isActive" = true
            ORDER BY "createdAt" DESC
            LIMIT 1
          `;
          clinic = owned && owned[0] ? owned[0] : null;

          // 2b) If not owner, try as active member of a clinic
          if (!clinic) {
            const member = await prisma.$queryRaw<{ id: string; name: string | null; slug: string | null; logo: string | null; description: string | null; website: string | null; city: string | null; state: string | null; ownerId: string | null }[]>`
              SELECT c.id, c.name, c.slug, c.logo, c.description, c.website, c.city, c.state, c."ownerId"
              FROM clinics c
              JOIN clinic_members cm ON cm."clinicId" = c.id
              WHERE cm."userId" = ${doctor.id}
                AND cm."isActive" = true
                AND c."isActive" = true
              ORDER BY cm."joinedAt" DESC
              LIMIT 1
            `;
            clinic = member && member[0] ? member[0] : null;
          }
        }
      } catch {}

      if (!clinic) {
        return NextResponse.json(
          { error: 'Clinic not found', debug: { slug: sanitizedSlug, tried: ['clinic_by_slug_or_subdomain', 'doctor_owner_clinic', 'doctor_member_clinic'] } },
          { status: 404 }
        );
      }
    }

    // Fetch branding (theme/colors) using a raw query to avoid client type mismatch
    let branding: { theme: 'LIGHT'|'DARK'; buttonColor: string | null; buttonTextColor: string | null } = {
      theme: 'LIGHT',
      buttonColor: null,
      buttonTextColor: null
    };
    try {
      const rows = await prisma.$queryRaw<{ theme: 'LIGHT'|'DARK'; buttonColor: string | null; buttonTextColor: string | null }[]>`
        SELECT theme::text as theme, "buttonColor", "buttonTextColor"
        FROM clinics
        WHERE slug = ${sanitizedSlug} OR "subdomain" = ${sanitizedSlug}
        LIMIT 1
      `;
      if (rows && rows[0]) {
        // @ts-expect-error runtime cast
        branding = rows[0] as any;
      }
    } catch {}

    // Retornar dados da clínica para personalização
    return NextResponse.json({
      success: true,
      clinic: {
        id: clinic.id,
        name: clinic.name,
        slug: clinic.slug ?? sanitizedSlug,
        logo: clinic.logo,
        description: clinic.description,
        website: clinic.website,
        location: clinic.city && clinic.state ? `${clinic.city}, ${clinic.state}` : null,
        owner: clinic.ownerId ? { id: clinic.ownerId, name: '', email: '' } : null,
        theme: branding.theme,
        buttonColor: branding.buttonColor,
        buttonTextColor: branding.buttonTextColor
      }
    });

  } catch (error) {
    console.error('Error fetching clinic by slug:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 