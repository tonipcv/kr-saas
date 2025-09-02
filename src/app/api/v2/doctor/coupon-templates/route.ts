import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyMobileAuth, unauthorizedResponse } from '@/lib/mobile-auth';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { FEATURES, isFeatureEnabledForDoctor } from '@/lib/feature-flags';

async function ensureFeatureEnabled(doctorId: string) {
  // Reuse campaign flags to gate UI/APIs consistently
  const globalEnabled = !!(FEATURES.CAMPAIGN_PAGES || FEATURES.CAMPAIGN_FORMS);
  if (!globalEnabled) return false;
  const perDoctor = await isFeatureEnabledForDoctor('CAMPAIGN_PAGES', doctorId);
  return !!perDoctor;
}

export async function GET(request: NextRequest) {
  try {
    // Authenticate doctor (web session first, fallback to mobile auth)
    let userId: string | null = null;
    let userRole: string | null = null;

    const session = await getServerSession(authOptions);
    if (session?.user?.id) {
      userId = session.user.id;
      const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
      userRole = dbUser?.role || null;
    } else {
      const mobileUser = await verifyMobileAuth(request);
      if (mobileUser?.id) {
        userId = mobileUser.id;
        userRole = mobileUser.role;
      }
    }

    if (!userId || userRole !== 'DOCTOR') {
      return unauthorizedResponse();
    }

    if (!(await ensureFeatureEnabled(userId))) {
      return NextResponse.json({ success: false, error: 'Feature disabled' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const search = searchParams.get('search')?.toLowerCase() || '';
    const isActive = searchParams.get('is_active'); // 'true' | 'false' | null

    const whereClauses: string[] = ['doctor_id = $1'];
    const params: any[] = [userId];
    let idx = params.length + 1;

    if (isActive === 'true' || isActive === 'false') {
      whereClauses.push(`is_active = $${idx++}`);
      params.push(isActive === 'true');
    }
    if (search) {
      whereClauses.push(`(LOWER(name) LIKE $${idx} OR LOWER(slug) LIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, doctor_id, name, slug, display_title, display_message, config, is_active, created_at, updated_at
       FROM coupon_templates
       ${whereSql}
       ORDER BY created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      ...params, limit, offset
    );

    const countRows: Array<{ count: bigint }> = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::bigint AS count FROM coupon_templates ${whereSql}`,
      ...params
    );

    const total = Number(countRows?.[0]?.count || 0);

    return NextResponse.json({
      success: true,
      data: rows,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
      message: 'Coupon templates loaded'
    });
  } catch (error) {
    console.error('Error in GET /api/v2/doctor/coupon-templates:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    let userId: string | null = null;
    let userRole: string | null = null;

    const session = await getServerSession(authOptions);
    if (session?.user?.id) {
      userId = session.user.id;
      const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
      userRole = dbUser?.role || null;
    } else {
      const mobileUser = await verifyMobileAuth(request);
      if (mobileUser?.id) {
        userId = mobileUser.id;
        userRole = mobileUser.role;
      }
    }

    if (!userId || userRole !== 'DOCTOR') {
      return unauthorizedResponse();
    }

    if (!(await ensureFeatureEnabled(userId))) {
      return NextResponse.json({ success: false, error: 'Feature disabled' }, { status: 403 });
    }

    const body = await request.json();
    const {
      slug,
      name,
      display_title,
      display_message,
      config,
      is_active = true
    } = body || {};

    if (!slug || !name) {
      return NextResponse.json({ success: false, error: 'slug and name are required' }, { status: 400 });
    }

    // Ensure unique (doctor_id, slug)
    const exists: Array<{ id: string }> = await prisma.$queryRawUnsafe(
      `SELECT id FROM coupon_templates WHERE doctor_id = $1 AND slug = $2 LIMIT 1`,
      userId, slug
    );
    if (exists && exists.length > 0) {
      return NextResponse.json({ success: false, error: 'slug already exists for this doctor' }, { status: 409 });
    }

    const now = new Date();
    const idRow: Array<{ id: string }> = await prisma.$queryRawUnsafe(
      `INSERT INTO coupon_templates (id, doctor_id, name, slug, display_title, display_message, config, is_active, created_at, updated_at)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
       RETURNING id`,
      userId,
      name,
      slug,
      display_title || null,
      display_message || null,
      config ? JSON.stringify(config) : '{}',
      !!is_active,
      now,
      now
    );

    const newId = idRow?.[0]?.id;
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, doctor_id, name, slug, display_title, display_message, config, is_active, created_at, updated_at
       FROM coupon_templates WHERE id = $1`,
      newId
    );

    return NextResponse.json({ success: true, data: rows?.[0] || null, message: 'Template criado com sucesso' }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/v2/doctor/coupon-templates:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
