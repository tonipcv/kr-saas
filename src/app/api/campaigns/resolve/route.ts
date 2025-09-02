import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { FEATURES } from '@/lib/feature-flags';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Public endpoint: GET /api/campaigns/resolve?slug={doctor_slug}&cupom=key1&cupom=key2
// Returns minimal data for published, valid campaigns whose campaign_slug matches any provided key
export async function GET(request: NextRequest) {
  try {
    if (!FEATURES.CAMPAIGN_PAGES) {
      return NextResponse.json({ success: true, data: [], message: 'Feature disabled' });
    }

    const { searchParams } = new URL(request.url);
    const slug = (searchParams.get('slug') || '').trim();
    const cupomParams = searchParams.getAll('cupom');
    const couponParams = searchParams.getAll('coupon');

    // Normalize to lower-case unique keys
    const keys = Array.from(new Set([...cupomParams, ...couponParams].map((k) => (k || '').toLowerCase().trim()).filter(Boolean)));

    if (!slug || keys.length === 0) {
      return NextResponse.json({ success: true, data: [], message: 'Missing slug or cupom keys' });
    }

    const doctor = await prisma.user.findFirst({
      where: { doctor_slug: slug, role: 'DOCTOR', is_active: true } as any,
      select: { id: true },
    });
    if (!doctor) {
      return NextResponse.json({ success: false, error: 'Doctor not found' }, { status: 404 });
    }

    const now = new Date();

    // Use unsafe raw to leverage ANY array matching safely with params
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, doctor_id, campaign_slug, title, description, benefit_title, benefit_description, hero_image_url, status, valid_from, valid_until, created_at, updated_at
       FROM campaigns
       WHERE doctor_id = $1
         AND status = 'PUBLISHED'
         AND (valid_from IS NULL OR valid_from <= $2)
         AND (valid_until IS NULL OR valid_until >= $2)
         AND LOWER(campaign_slug) = ANY($3)
       LIMIT 20`,
      doctor.id,
      now,
      keys
    );

    const data = rows.map((c) => ({
      id: String(c.id),
      campaign_slug: String(c.campaign_slug),
      title: (c.title as string) || '',
      description: (c.description as string) || null,
      benefit_title: (c.benefit_title as string) || null,
    }));

    return NextResponse.json({ success: true, data, count: data.length });
  } catch (error) {
    console.error('[api/campaigns/resolve] GET error', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
