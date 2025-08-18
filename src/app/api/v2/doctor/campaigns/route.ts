import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyMobileAuth, unauthorizedResponse } from '@/lib/mobile-auth';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { FEATURES, isFeatureEnabledForDoctor } from '@/lib/feature-flags';

// Helper to ensure features are enabled (with diagnostics)
async function ensureFeatureEnabled(doctorId: string) {
  const globalEnabled = !!(FEATURES.CAMPAIGN_PAGES || FEATURES.CAMPAIGN_FORMS);
  if (!globalEnabled) {
    console.error('[campaigns] Feature disabled (global flags)', {
      doctorId,
      flags: {
        CAMPAIGN_PAGES: FEATURES.CAMPAIGN_PAGES,
        CAMPAIGN_FORMS: FEATURES.CAMPAIGN_FORMS,
        CAMPAIGN_PREVIEW: FEATURES.CAMPAIGN_PREVIEW
      }
    });
    return false;
  }
  const perDoctor = await isFeatureEnabledForDoctor('CAMPAIGN_PAGES', doctorId);
  if (!perDoctor) {
    console.error('[campaigns] Feature disabled for doctor (allowlist)', {
      doctorId,
      needed: 'doctor_feature_flags: CAMPAIGN_PAGES=true'
    });
    return false;
  }
  return true;
}

export async function GET(request: NextRequest) {
  try {
    // Auth: web first, then mobile
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
      console.error('[campaigns][GET] Unauthorized access', { userId, userRole });
      return unauthorizedResponse();
    }

    if (!(await ensureFeatureEnabled(userId))) {
      return NextResponse.json({ success: false, error: 'Feature disabled' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const search = searchParams.get('search')?.toLowerCase() || '';
    const status = searchParams.get('status') || undefined; // DRAFT | PUBLISHED | ARCHIVED

    // Build WHERE conditions safely
    const whereClauses: string[] = ['doctor_id = $1'];
    const params: any[] = [userId];
    let paramIndex = params.length + 1;

    if (status) {
      whereClauses.push(`status = $${paramIndex++}`);
      params.push(status);
    }
    if (search) {
      whereClauses.push(`LOWER(title) LIKE $${paramIndex++}`);
      params.push(`%${search}%`);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, doctor_id, campaign_slug, title, description, benefit_title, benefit_description, hero_image_url, form_config, status, valid_from, valid_until, created_at, updated_at
       FROM campaigns
       ${whereSql}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      ...params, limit, offset
    );

    const countRows: Array<{ count: bigint } > = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::bigint AS count FROM campaigns ${whereSql}`,
      ...params
    );

    const total = Number(countRows?.[0]?.count || 0);

    return NextResponse.json({
      success: true,
      data: rows,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
      message: 'Campanhas carregadas com sucesso'
    });
  } catch (error) {
    console.error('Error in GET /api/v2/doctor/campaigns:', error);
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
      console.error('[campaigns][POST] Unauthorized access', { userId, userRole });
      return unauthorizedResponse();
    }

    if (!(await ensureFeatureEnabled(userId))) {
      return NextResponse.json({ success: false, error: 'Feature disabled' }, { status: 403 });
    }

    const body = await request.json();
    const {
      campaign_slug,
      title,
      description,
      benefit_title,
      benefit_description,
      hero_image_url,
      form_config,
      status = 'DRAFT',
      valid_from,
      valid_until
    } = body || {};

    if (!campaign_slug || !title) {
      return NextResponse.json({ success: false, error: 'campaign_slug and title are required' }, { status: 400 });
    }

    // Enforce unique slug per doctor
    const exists: Array<{ id: string }> = await prisma.$queryRawUnsafe(
      `SELECT id FROM campaigns WHERE doctor_id = $1 AND campaign_slug = $2 LIMIT 1`,
      userId, campaign_slug
    );
    if (exists && exists.length > 0) {
      return NextResponse.json({ success: false, error: 'campaign_slug already exists for this doctor' }, { status: 409 });
    }

    // Insert campaign
    const now = new Date();
    const idRow: Array<{ id: string }> = await prisma.$queryRawUnsafe(
      `INSERT INTO campaigns (id, doctor_id, campaign_slug, title, description, benefit_title, benefit_description, hero_image_url, form_config, status, valid_from, valid_until, created_at, updated_at)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13)
       RETURNING id`,
      userId,
      campaign_slug,
      title,
      description || null,
      benefit_title || null,
      benefit_description || null,
      hero_image_url || null,
      form_config ? JSON.stringify(form_config) : null,
      status,
      valid_from ? new Date(valid_from) : null,
      valid_until ? new Date(valid_until) : null,
      now,
      now
    );

    const newId = idRow?.[0]?.id;
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, doctor_id, campaign_slug, title, description, benefit_title, benefit_description, hero_image_url, form_config, status, valid_from, valid_until, created_at, updated_at
       FROM campaigns WHERE id = $1`,
      newId
    );

    return NextResponse.json({ success: true, data: rows?.[0] || null, message: 'Campanha criada com sucesso' }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/v2/doctor/campaigns:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
