import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function ok(data: any) {
  return NextResponse.json({ success: true, data });
}
function badRequest(message: string) {
  return NextResponse.json({ success: false, message }, { status: 400 });
}
function unauthorized(message = 'Não autorizado') {
  return NextResponse.json({ success: false, message }, { status: 401 });
}
function serverError(message = 'Erro interno do servidor') {
  return NextResponse.json({ success: false, message }, { status: 500 });
}

// POST /api/coupons/claim
// Body: { doctor_slug: string, template_slug?: string, template_id?: string }
// Creates or updates a coupon for the logged-in patient using the doctor's template
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const patientId = session?.user?.id;
    if (!patientId) return unauthorized();

    const body = await req.json().catch(() => null);
    if (!body) return badRequest('JSON inválido');

    const doctorSlug: string | undefined = body.doctor_slug;
    const templateSlug: string | undefined = body.template_slug;
    const templateId: string | undefined = body.template_id;
    if (!doctorSlug) return badRequest('doctor_slug é obrigatório');
    if (!templateSlug && !templateId) return badRequest('template_slug ou template_id é obrigatório');

    const doctor = await prisma.user.findFirst({ where: { doctor_slug: doctorSlug } });
    if (!doctor?.id) return badRequest('Médico não encontrado');

    // find template (active)
    const template = await prisma.couponTemplate.findFirst({
      where: {
        doctorId: doctor.id,
        ...(templateId ? { id: templateId } : {}),
        ...(templateSlug ? { slug: templateSlug } : {}),
        isActive: true,
      },
      select: { id: true, slug: true, displayTitle: true, displayMessage: true, config: true },
    });
    if (!template) return badRequest('Modelo de cupom não encontrado ou inativo');

    const objective = `TEMPLATE:${template.slug}`;
    const objectiveMeta: any = { template_slug: template.slug, ...(template.config || {}) };
    const productId: string | undefined = (template.config as any)?.product_id || (template.config as any)?.productId || undefined;

    const now = new Date();
    const coupon = await prisma.coupon.upsert({
      where: {
        doctorId_patientId_objective: {
          doctorId: doctor.id,
          patientId,
          objective,
        },
      },
      update: {
        objectiveMeta,
        displayTitle: template.displayTitle ?? undefined,
        displayMessage: template.displayMessage ?? undefined,
        productId: productId ?? undefined,
        templateId: template.id,
        status: 'ISSUED',
        updatedAt: now,
      },
      create: {
        code: cryptoRandomString(10),
        doctorId: doctor.id,
        patientId,
        objective,
        objectiveMeta,
        displayTitle: template.displayTitle ?? undefined,
        displayMessage: template.displayMessage ?? undefined,
        productId: productId ?? undefined,
        templateId: template.id,
        status: 'ISSUED',
        createdAt: now,
        updatedAt: now,
      },
      include: { template: true },
    });

    return ok({ coupon });
  } catch (err: any) {
    console.error('POST /api/coupons/claim error', err);
    return serverError(err?.message || undefined);
  }
}

function cryptoRandomString(len: number) {
  const buf = require('crypto').randomBytes(Math.ceil((len * 3) / 4));
  return buf.toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, len);
}
