import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

function ok(data: any) {
  return NextResponse.json({ success: true, data });
}
function badRequest(message: string) {
  return NextResponse.json({ success: false, message }, { status: 400 });
}
function unauthorized(message = 'Não autorizado') {
  return NextResponse.json({ success: false, message }, { status: 401 });
}
function forbidden(message = 'Acesso negado') {
  return NextResponse.json({ success: false, message }, { status: 403 });
}
function serverError(message = 'Erro interno do servidor') {
  return NextResponse.json({ success: false, message }, { status: 500 });
}

// POST /api/coupons/issue
// Body (snake_case): { patient_id, objective, code?, objective_meta?, display_title?, display_message?, campaign_id?, referrer_id?, product_id?, expires_at?, template_id?, template_slug? }
// Enforces uniqueness per (doctor_id, patient_id, objective)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return unauthorized();

    const doctorId = session.user.id;
    const me = await prisma.user.findUnique({ where: { id: doctorId }, select: { role: true } });
    if (!me || me.role !== 'DOCTOR') return forbidden('Apenas médicos podem emitir cupons.');

    const body = await req.json().catch(() => null);
    if (!body) return badRequest('JSON inválido');

    const patientId: string | undefined = body.patient_id;
    const objective: string | undefined = body.objective;
    const code: string | undefined = body.code || undefined;
    const objectiveMeta: any | undefined = body.objective_meta ?? undefined;
    const displayTitle: string | undefined = body.display_title ?? undefined;
    const displayMessage: string | undefined = body.display_message ?? undefined;
    const campaignId: string | undefined = body.campaign_id ?? undefined;
    const referrerId: string | undefined = body.referrer_id ?? undefined;
    const productId: string | undefined = body.product_id ?? undefined;
    const expiresAtRaw: string | undefined = body.expires_at ?? undefined;
    const templateIdRaw: string | undefined = body.template_id ?? undefined;
    const templateSlugRaw: string | undefined = body.template_slug ?? undefined;

    if (!patientId) return badRequest('patient_id é obrigatório');
    if (!objective && !templateIdRaw && !templateSlugRaw) return badRequest('objective ou template_id/template_slug é obrigatório');

    // Parse date if provided
    const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;
    if (expiresAtRaw && Number.isNaN(expiresAt!.getTime())) return badRequest('expires_at inválido');

    // If template provided, fetch and merge defaults
    let tpl: null | {
      id: string;
      slug: string;
      displayTitle: string | null;
      displayMessage: string | null;
      config: any | null;
    } = null;
    if (templateIdRaw || templateSlugRaw) {
      tpl = await prisma.couponTemplate.findFirst({
        where: {
          doctorId,
          ...(templateIdRaw ? { id: templateIdRaw } : {}),
          ...(templateSlugRaw ? { slug: templateSlugRaw.toString() } : {}),
          isActive: true,
        },
        select: { id: true, slug: true, displayTitle: true, displayMessage: true, config: true },
      });
      if (!tpl) return badRequest('Modelo de cupom não encontrado ou inativo');
    }

    const mergedDisplayTitle = displayTitle ?? tpl?.displayTitle ?? undefined;
    const mergedDisplayMessage = displayMessage ?? tpl?.displayMessage ?? undefined;
    const mergedObjective = objective ?? (tpl ? `TEMPLATE:${tpl.slug}` : undefined);
    const mergedObjectiveMeta: any | undefined = (() => {
      const metaFromTpl = tpl?.config ? { template_slug: tpl.slug, ...tpl.config } : (tpl ? { template_slug: tpl.slug } : undefined);
      if (objectiveMeta && metaFromTpl) return { ...metaFromTpl, ...objectiveMeta };
      return objectiveMeta ?? metaFromTpl ?? undefined;
    })();
    const mergedProductId = productId ?? (tpl?.config?.product_id || tpl?.config?.productId) ?? undefined;

    if (!mergedObjective) return badRequest('objective é obrigatório quando o template não define um');

    // Upsert by composite unique (doctorId, patientId, objective)
    const now = new Date();

    const coupon = await prisma.coupon.upsert({
      where: {
        doctorId_patientId_objective: {
          doctorId,
          patientId,
          objective: mergedObjective,
        },
      },
      update: {
        code: code ?? undefined,
        objectiveMeta: mergedObjectiveMeta ?? undefined,
        displayTitle: mergedDisplayTitle ?? undefined,
        displayMessage: mergedDisplayMessage ?? undefined,
        campaignId: campaignId ?? undefined,
        referrerId: referrerId ?? undefined,
        productId: mergedProductId ?? undefined,
        templateId: tpl?.id ?? undefined,
        expiresAt: expiresAt ?? undefined,
        status: 'ISSUED',
        updatedAt: now,
      },
      create: {
        id: undefined as unknown as string, // allow Prisma default
        code: code ?? cryptoRandomString(10),
        doctorId,
        patientId,
        objective: mergedObjective,
        objectiveMeta: mergedObjectiveMeta ?? undefined,
        displayTitle: mergedDisplayTitle ?? undefined,
        displayMessage: mergedDisplayMessage ?? undefined,
        campaignId: campaignId ?? undefined,
        referrerId: referrerId ?? undefined,
        productId: mergedProductId ?? undefined,
        templateId: tpl?.id ?? undefined,
        status: 'ISSUED',
        expiresAt: expiresAt ?? undefined,
        createdAt: now,
        updatedAt: now,
      },
    });

    return ok({ coupon });
  } catch (err: any) {
    console.error('POST /api/coupons/issue error', err);
    return serverError(err?.message || undefined);
  }
}

function cryptoRandomString(len: number) {
  // Simple URL-safe random string
  const buf = require('crypto').randomBytes(Math.ceil((len * 3) / 4));
  return buf.toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, len);
}
