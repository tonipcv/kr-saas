import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Public endpoint: GET /api/coupon-templates/resolve?slug={doctor_slug}&cupom=key1&cupom=key2
// Returns minimal data for active coupon templates whose slug matches any provided key
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = (searchParams.get('slug') || '').trim();
    const cupomParams = searchParams.getAll('cupom');
    const couponParams = searchParams.getAll('coupon');

    const keys = Array.from(new Set([...cupomParams, ...couponParams].map((k) => (k || '').toLowerCase().trim()).filter(Boolean)));
    if (keys.length === 0) {
      return NextResponse.json({ success: true, data: [], message: 'Missing cupom keys' });
    }
    
    console.log('[api/coupon-templates/resolve] Resolving for keys:', keys);

    // Query templates directly by slug without requiring doctor resolution
    // Our script showed templates exist but clinic might not
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, doctor_id, slug, name, display_title, display_message, is_active
       FROM coupon_templates
       WHERE is_active = true AND LOWER(slug) = ANY($1)
       LIMIT 20`,
      keys
    );
    
    console.log('[api/coupon-templates/resolve] Raw rows found:', rows.length, JSON.stringify(rows, null, 2));

    const data = rows.map((r) => ({
      id: String(r.id),
      slug: String(r.slug),
      name: (r.name as string) || '',
      display_title: (r.display_title as string) || null,
      display_message: (r.display_message as string) || null,
    }));

    return NextResponse.json({ success: true, data, count: data.length });
  } catch (error) {
    console.error('[api/coupon-templates/resolve] GET error', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
