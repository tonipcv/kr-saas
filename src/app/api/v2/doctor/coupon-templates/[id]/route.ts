import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyMobileAuth, unauthorizedResponse } from '@/lib/mobile-auth';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { FEATURES, isFeatureEnabledForDoctor } from '@/lib/feature-flags';

async function ensureFeatureEnabled(doctorId: string) {
  const globalEnabled = !!(FEATURES.CAMPAIGN_PAGES || FEATURES.CAMPAIGN_FORMS);
  if (!globalEnabled) return false;
  const perDoctor = await isFeatureEnabledForDoctor('CAMPAIGN_PAGES', doctorId);
  return !!perDoctor;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!id) return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 });

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
      is_active
    } = body || {};

    // Verify ownership/clinic access
    const tplRows: Array<{ doctor_id: string; clinic_id: string | null }> = await prisma.$queryRawUnsafe(
      `SELECT doctor_id, clinic_id FROM coupon_templates WHERE id = $1 LIMIT 1`,
      id
    );
    const tpl = tplRows?.[0];
    if (!tpl) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }
    // If template is clinic-scoped, require access to that clinic
    if (tpl.clinic_id) {
      const hasAccess = await prisma.clinic.findFirst({
        where: {
          id: tpl.clinic_id,
          OR: [
            { ownerId: userId },
            { members: { some: { userId, isActive: true } } },
          ],
        },
        select: { id: true },
      });
      if (!hasAccess) {
        return NextResponse.json({ success: false, error: 'Access denied to this clinic' }, { status: 403 });
      }
    } else if (tpl.doctor_id !== userId) {
      // Legacy doctor-scoped: still require ownership
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    // Unique slug scope: within clinic if clinic_id exists, else within doctor
    if (typeof slug === 'string' && slug.trim().length > 0) {
      let exists: Array<{ id: string }> = [];
      if (tpl.clinic_id) {
        exists = await prisma.$queryRawUnsafe(
          `SELECT id FROM coupon_templates WHERE clinic_id = $1 AND slug = $2 AND id <> $3 LIMIT 1`,
          tpl.clinic_id, slug, id
        );
        if (exists && exists.length > 0) {
          return NextResponse.json({ success: false, error: 'slug already exists for this clinic' }, { status: 409 });
        }
      } else {
        exists = await prisma.$queryRawUnsafe(
          `SELECT id FROM coupon_templates WHERE doctor_id = $1 AND slug = $2 AND id <> $3 LIMIT 1`,
          userId, slug, id
        );
        if (exists && exists.length > 0) {
          return NextResponse.json({ success: false, error: 'slug already exists for this doctor' }, { status: 409 });
        }
      }
    }

    // Build dynamic update
    const sets: string[] = [];
    const paramsArr: any[] = [];
    let idx = 1;

    const pushSet = (sql: string, val: any) => {
      sets.push(`${sql} $${idx++}`);
      paramsArr.push(val);
    };

    if (typeof slug === 'string') pushSet('slug =', slug || null);
    if (typeof name === 'string') pushSet('name =', name || null);
    if (typeof display_title === 'string') pushSet('display_title =', display_title || null);
    if (typeof display_message === 'string') pushSet('display_message =', display_message || null);
    if (typeof is_active === 'boolean') pushSet('is_active =', !!is_active);
    if (config !== undefined) {
      // Ensure jsonb type
      sets.push(`config = $${idx++}::jsonb`);
      paramsArr.push(config ?? {});
    }

    // Always update timestamp
    sets.push(`updated_at = $${idx++}`);
    paramsArr.push(new Date());

    // WHERE clause
    const whereIdx = idx++;

    if (sets.length === 1) {
      // only updated_at -> nothing to update
      return NextResponse.json({ success: false, error: 'No fields to update' }, { status: 400 });
    }

    const sql = `UPDATE coupon_templates SET ${sets.join(', ')} WHERE id = $${whereIdx} RETURNING id`;
    const resRows: Array<{ id: string }> = await prisma.$queryRawUnsafe(sql, ...paramsArr, id);

    if (!resRows?.[0]?.id) {
      return NextResponse.json({ success: false, error: 'Update failed' }, { status: 500 });
    }

    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, doctor_id, name, slug, display_title, display_message, config, is_active, created_at, updated_at
       FROM coupon_templates WHERE id = $1`,
      id
    );

    return NextResponse.json({ success: true, data: rows?.[0] || null, message: 'Template atualizado com sucesso' });
  } catch (error) {
    console.error('Error in PATCH /api/v2/doctor/coupon-templates/[id]:', (error as any)?.message, (error as any)?.stack);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
