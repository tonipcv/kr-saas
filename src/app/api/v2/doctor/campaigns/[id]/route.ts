import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyMobileAuth, unauthorizedResponse } from '@/lib/mobile-auth';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { FEATURES, isFeatureEnabledForDoctor } from '@/lib/feature-flags';

async function ensureFeatureEnabled(doctorId: string) {
  const globalEnabled = !!(FEATURES.CAMPAIGN_PAGES || FEATURES.CAMPAIGN_FORMS);
  if (!globalEnabled) {
    console.error('[campaigns][item] Feature disabled (global flags)', {
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
    console.error('[campaigns][item] Feature disabled for doctor (allowlist)', {
      doctorId,
      needed: 'doctor_feature_flags: CAMPAIGN_PAGES=true'
    });
    return false;
  }
  return true;
}

async function authDoctor(request: NextRequest) {
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
    console.error('[campaigns][item] Unauthorized', { userId, userRole });
    return null;
  }
  return userId;
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const doctorId = await authDoctor(request);
    if (!doctorId) return unauthorizedResponse();

    if (!(await ensureFeatureEnabled(doctorId))) {
      return NextResponse.json({ success: false, error: 'Feature disabled' }, { status: 403 });
    }

    const id = params.id;
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, doctor_id, campaign_slug, title, description, benefit_title, benefit_description, hero_image_url, form_config, status, valid_from, valid_until, created_at, updated_at
       FROM campaigns
       WHERE id = $1 AND doctor_id = $2
       LIMIT 1`,
      id, doctorId
    );

    if (!rows || rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: rows[0], message: 'Campanha carregada' });
  } catch (error) {
    console.error('Error in GET /api/v2/doctor/campaigns/[id]:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const doctorId = await authDoctor(request);
    if (!doctorId) return unauthorizedResponse();

    if (!(await ensureFeatureEnabled(doctorId))) {
      return NextResponse.json({ success: false, error: 'Feature disabled' }, { status: 403 });
    }

    const id = params.id;
    const body = await request.json();
    const {
      campaign_slug,
      title,
      description,
      benefit_title,
      benefit_description,
      hero_image_url,
      form_config,
      status,
      valid_from,
      valid_until
    } = body || {};

    // Check exists and ownership
    const exists: Array<{ id: string; campaign_slug: string } > = await prisma.$queryRawUnsafe(
      `SELECT id, campaign_slug FROM campaigns WHERE id = $1 AND doctor_id = $2 LIMIT 1`,
      id, doctorId
    );
    if (!exists || exists.length === 0) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });
    }

    // Unique slug per doctor if changing
    if (campaign_slug && campaign_slug !== exists[0].campaign_slug) {
      const conflict: Array<{ id: string }> = await prisma.$queryRawUnsafe(
        `SELECT id FROM campaigns WHERE doctor_id = $1 AND campaign_slug = $2 AND id <> $3 LIMIT 1`,
        doctorId, campaign_slug, id
      );
      if (conflict && conflict.length > 0) {
        return NextResponse.json({ success: false, error: 'campaign_slug already exists for this doctor' }, { status: 409 });
      }
    }

    // Build update dynamically
    const sets: string[] = [];
    const paramsArr: any[] = [];
    let idx = 1;

    function pushSet(column: string, value: any, cast?: string) {
      sets.push(`${column} = $${idx}${cast ? '::' + cast : ''}`);
      paramsArr.push(value);
      idx += 1;
    }

    if (campaign_slug !== undefined) pushSet('campaign_slug', campaign_slug);
    if (title !== undefined) pushSet('title', title);
    if (description !== undefined) pushSet('description', description || null);
    if (benefit_title !== undefined) pushSet('benefit_title', benefit_title || null);
    if (benefit_description !== undefined) pushSet('benefit_description', benefit_description || null);
    if (hero_image_url !== undefined) pushSet('hero_image_url', hero_image_url || null);
    if (form_config !== undefined) pushSet('form_config', form_config ? JSON.stringify(form_config) : null, 'jsonb');
    if (status !== undefined) pushSet('status', status);
    if (valid_from !== undefined) pushSet('valid_from', valid_from ? new Date(valid_from) : null);
    if (valid_until !== undefined) pushSet('valid_until', valid_until ? new Date(valid_until) : null);

    // Always update updated_at
    sets.push(`updated_at = NOW()`);

    if (sets.length === 1) { // only updated_at
      return NextResponse.json({ success: true, data: exists[0], message: 'Nada para atualizar' });
    }

    const updateSql = `UPDATE campaigns SET ${sets.join(', ')} WHERE id = $${idx} AND doctor_id = $${idx + 1}`;
    paramsArr.push(id, doctorId);

    await prisma.$executeRawUnsafe(updateSql, ...paramsArr);

    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, doctor_id, campaign_slug, title, description, benefit_title, benefit_description, hero_image_url, form_config, status, valid_from, valid_until, created_at, updated_at
       FROM campaigns WHERE id = $1`,
      id
    );

    return NextResponse.json({ success: true, data: rows?.[0] || null, message: 'Campanha atualizada' });
  } catch (error) {
    console.error('Error in PATCH /api/v2/doctor/campaigns/[id]:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const doctorId = await authDoctor(request);
    if (!doctorId) return unauthorizedResponse();

    if (!(await ensureFeatureEnabled(doctorId))) {
      return NextResponse.json({ success: false, error: 'Feature disabled' }, { status: 403 });
    }

    const id = params.id;

    // Soft-delete => status = ARCHIVED
    const result: any = await prisma.$executeRawUnsafe(
      `UPDATE campaigns SET status = 'ARCHIVED', updated_at = NOW() WHERE id = $1 AND doctor_id = $2`,
      id, doctorId
    );

    return NextResponse.json({ success: true, data: { id, status: 'ARCHIVED' }, message: 'Campanha arquivada' });
  } catch (error) {
    console.error('Error in DELETE /api/v2/doctor/campaigns/[id]:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
