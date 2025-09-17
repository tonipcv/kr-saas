import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Public: GET /api/clinic/theme?slug={clinicSlug}
// Returns clinic theme and branding colors when clinic is found by slug or subdomain
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = (searchParams.get('slug') || '').trim().toLowerCase();
    if (!slug) {
      return NextResponse.json({ success: false, error: 'Missing slug' }, { status: 400 });
    }

    const rows = await prisma.$queryRaw<{ id: string; theme: 'LIGHT' | 'DARK'; buttonColor: string | null; buttonTextColor: string | null }[]>`
      SELECT id, theme::text as theme, "buttonColor", "buttonTextColor"
      FROM clinics
      WHERE LOWER(slug) = ${slug} OR LOWER("subdomain") = ${slug}
      LIMIT 1
    `;

    if (!rows || !rows[0]) {
      return NextResponse.json({ success: true, data: null, message: 'Clinic not found' });
    }

    const clinic = rows[0];
    return NextResponse.json({ success: true, data: clinic });
  } catch (error) {
    console.error('[api/clinic/theme] GET error', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
