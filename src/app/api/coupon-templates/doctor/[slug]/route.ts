import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Public: GET /api/coupon-templates/doctor/[slug]
// Lists active coupon templates for a doctor by public slug
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const resolved = await params;
    const slug = (resolved?.slug || '').trim().toLowerCase();
    if (!slug) {
      return NextResponse.json({ success: false, error: 'Missing slug' }, { status: 400 });
    }

    // Try clinic first
    const clinicRows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM clinics WHERE slug = ${slug} OR "subdomain" = ${slug} LIMIT 1
    `;
    const clinicId = clinicRows?.[0]?.id || null;
    let rows: any[] = [];
    if (clinicId) {
      rows = await prisma.$queryRawUnsafe(
        `SELECT id, doctor_id, clinic_id, name, slug, display_title, display_message, is_active, created_at, updated_at
         FROM coupon_templates
         WHERE clinic_id = $1 AND is_active = true
         ORDER BY created_at DESC
         LIMIT 100`,
        clinicId
      );
    } else {
      // Fallback: Find doctor id by public slug and list by doctor_id (legacy)
      const doctor = await prisma.user.findFirst({
        where: { doctor_slug: slug },
        select: { id: true },
      });
      if (!doctor?.id) {
        return NextResponse.json({ success: true, data: [], message: 'Doctor/Clinic not found' });
      }
      rows = await prisma.$queryRawUnsafe(
        `SELECT id, doctor_id, clinic_id, name, slug, display_title, display_message, is_active, created_at, updated_at
         FROM coupon_templates
         WHERE doctor_id = $1 AND is_active = true
         ORDER BY created_at DESC
         LIMIT 100`,
        doctor.id
      );
    }

    const data = rows.map((r) => ({
      id: String(r.id),
      slug: String(r.slug),
      name: (r.name as string) || '',
      display_title: (r.display_title as string) || null,
      display_message: (r.display_message as string) || null,
      is_active: !!r.is_active,
    }));

    return NextResponse.json({ success: true, data, count: data.length });
  } catch (error) {
    console.error('[api/coupon-templates/doctor/[slug]] GET error', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
