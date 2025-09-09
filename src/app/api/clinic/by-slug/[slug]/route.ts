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

    // Buscar clínica pelo slug
    const clinic = await prisma.clinic.findUnique({
      where: {
        slug: sanitizedSlug,
        isActive: true // Apenas clínicas ativas
      },
      select: {
        id: true,
        name: true,
        slug: true,
        logo: true,
        description: true,
        website: true,
        city: true,
        state: true,
        // Avoid selecting new fields directly to prevent client-type mismatch
        owner: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (!clinic) {
      return NextResponse.json(
        { error: 'Clinic not found' },
        { status: 404 }
      );
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
        WHERE slug = ${sanitizedSlug}
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
        slug: clinic.slug,
        logo: clinic.logo,
        description: clinic.description,
        website: clinic.website,
        location: clinic.city && clinic.state ? `${clinic.city}, ${clinic.state}` : null,
        owner: clinic.owner,
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