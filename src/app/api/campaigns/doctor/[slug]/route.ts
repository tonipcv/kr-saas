import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { FEATURES } from '@/lib/feature-flags';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Public endpoint: GET /api/campaigns/doctor/{slug}
// Returns published and currently valid campaigns for a doctor identified by slug
export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    if (!FEATURES.CAMPAIGN_PAGES) {
      return NextResponse.json({ success: true, data: [], message: 'Feature disabled' });
    }

    const { slug } = await params;
    const doctor = await prisma.user.findFirst({
      where: { doctor_slug: slug, role: 'DOCTOR', is_active: true } as any,
      select: { id: true, doctor_slug: true },
    });
    if (!doctor) {
      return NextResponse.json({ success: false, error: 'Doctor not found' }, { status: 404 });
    }

    const now = new Date();
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, doctor_id, campaign_slug, title, description, benefit_title, benefit_description, hero_image_url, status, valid_from, valid_until, created_at, updated_at
       FROM campaigns
       WHERE doctor_id = $1
         AND status = 'PUBLISHED'
         AND (valid_from IS NULL OR valid_from <= $2)
         AND (valid_until IS NULL OR valid_until >= $2)
       ORDER BY created_at DESC
       LIMIT 50`,
      doctor.id,
      now
    );

    // Minimal payload for listing
    const data = rows.map((c) => ({
      id: c.id as string,
      campaign_slug: c.campaign_slug as string,
      title: (c.title as string) || '',
      description: (c.description as string) || null,
      benefit_title: (c.benefit_title as string) || null,
    }));

    return NextResponse.json({ success: true, data, count: data.length });
  } catch (error) {
    console.error('[api/campaigns/doctor/[slug]] GET error', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
