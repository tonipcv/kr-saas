import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

function isEnabled() {
  return String(process.env.CHECKOUT_SESSIONS_ENABLED || '').toLowerCase() === 'true';
}

function safeStr(v: any) { return typeof v === 'string' ? v : (v == null ? null : String(v)); }
function safeInt(v: any) { const n = Number(v); return Number.isFinite(n) ? n : null; }

export async function POST(req: Request) {
  try {
    if (!isEnabled()) return NextResponse.json({ error: 'disabled' }, { status: 404 });
    const body = await req.json().catch(() => ({}));
    const now = new Date();

    // Fields
    let resumeToken = safeStr(body.resumeToken) || null;
    const slug = safeStr(body.slug);
    const clinicId = safeStr(body.clinicId) || null;
    const productId = safeStr(body.productId) || null;
    const offerId = safeStr(body.offerId) || null;
    const email = safeStr(body.email) || null;
    const phone = safeStr(body.phone) || null;
    const document = safeStr(body.document) || null;
    const paymentMethod = safeStr(body.paymentMethod) as any;
    const selectedInstallments = safeInt(body.selectedInstallments);
    const selectedBank = safeStr(body.selectedBank) || null;
    const paymentMethodsAllowed = body.paymentMethodsAllowed ?? null;
    const metadata = body.metadata ?? null;
    const lastStep = safeStr(body.lastStep) || null;
    const origin = safeStr(body.origin) || null;
    const createdBy = safeStr(body.createdBy) || 'checkout-ui';

    // Attribution
    const utmSource = safeStr(body.utmSource) || null;
    const utmMedium = safeStr(body.utmMedium) || null;
    const utmCampaign = safeStr(body.utmCampaign) || null;
    const utmTerm = safeStr(body.utmTerm) || null;
    const utmContent = safeStr(body.utmContent) || null;
    const referrer = safeStr(body.referrer) || null;

    // IP / UA
    const ip = safeStr((req.headers.get('x-forwarded-for') || '').split(',')[0] || '') || null;
    const userAgent = safeStr(req.headers.get('user-agent')) || null;

    if (!resumeToken) resumeToken = crypto.randomUUID();

    const exists = await prisma.checkoutSession.findUnique({ where: { resumeToken } });

    let sess;
    if (!exists) {
      sess = await prisma.checkoutSession.create({
        data: {
          resumeToken,
          clinicId, productId, offerId, slug,
          email, phone, document,
          paymentMethod: paymentMethod || undefined,
          selectedInstallments: selectedInstallments ?? undefined,
          selectedBank,
          paymentMethodsAllowed: paymentMethodsAllowed as any,
          metadata: metadata as any,
          lastStep,
          origin,
          createdBy,
          utmSource, utmMedium, utmCampaign, utmTerm, utmContent,
          referrer, ip, userAgent,
          startedAt: now,
        }
      });
    } else {
      sess = await prisma.checkoutSession.update({
        where: { resumeToken },
        data: {
          clinicId: clinicId ?? undefined,
          productId: productId ?? undefined,
          offerId: offerId ?? undefined,
          slug: slug ?? undefined,
          email: email ?? undefined,
          phone: phone ?? undefined,
          document: document ?? undefined,
          paymentMethod: paymentMethod ?? undefined,
          selectedInstallments: selectedInstallments ?? undefined,
          selectedBank: selectedBank ?? undefined,
          paymentMethodsAllowed: (paymentMethodsAllowed as any) ?? undefined,
          metadata: (metadata as any) ?? undefined,
          lastStep: lastStep ?? undefined,
          origin: origin ?? undefined,
          createdBy: createdBy ?? undefined,
          utmSource: utmSource ?? undefined,
          utmMedium: utmMedium ?? undefined,
          utmCampaign: utmCampaign ?? undefined,
          utmTerm: utmTerm ?? undefined,
          utmContent: utmContent ?? undefined,
          referrer: referrer ?? undefined,
          ip: ip ?? undefined,
          userAgent: userAgent ?? undefined,
        }
      });
    }

    return NextResponse.json({ success: true, id: sess.id, resumeToken });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'internal_error' }, { status: 500 });
  }
}
