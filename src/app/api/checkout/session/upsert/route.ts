import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

function isEnabled() { return true; }

function safeStr(v: any) { return typeof v === 'string' ? v : (v == null ? null : String(v)); }
function safeInt(v: any) { const n = Number(v); return Number.isFinite(n) ? n : null; }

export async function POST(req: Request) {
  try {
    if (!isEnabled()) return NextResponse.json({ error: 'disabled' }, { status: 200 });
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

    const exists = await prisma.checkoutSession.findUnique({ where: { resumeToken }, select: { id: true, resumeToken: true } });

    let sess;
    try {
      if (!exists) {
        sess = await prisma.checkoutSession.create({
          data: {
            resumeToken,
            clinicId, productId, offerId, slug,
            email, phone, document,
            // avoid enum cast issues by not touching paymentMethod when uncertain
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
          },
          select: { id: true, resumeToken: true }
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
            // avoid enum cast
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
          },
          select: { id: true, resumeToken: true }
        });
      }
    } catch (err: any) {
      const msg = String(err?.message || '');
      const enumIssue = msg.includes('CheckoutPaymentMethod') || msg.includes('42704') || msg.toLowerCase().includes('does not exist');
      if (!enumIssue) throw err;
      // Fallback: raw upsert without touching payment_method
      const idForInsert = resumeToken || crypto.randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO checkout_sessions (
            id, resume_token, slug, clinic_id, product_id, offer_id, email, phone, document,
            selected_installments, selected_bank, payment_methods_allowed, metadata, last_step,
            origin, created_by, utm_source, utm_medium, utm_campaign, utm_term, utm_content,
            referrer, ip, user_agent, started_at, updated_at
         ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9,
            $10, $11, $12, $13, $14,
            $15, $16, $17, $18, $19, $20, $21,
            $22, $23, $24, $25, NOW()
         )
         ON CONFLICT (resume_token) DO UPDATE SET
            slug = EXCLUDED.slug,
            clinic_id = EXCLUDED.clinic_id,
            product_id = EXCLUDED.product_id,
            offer_id = EXCLUDED.offer_id,
            email = EXCLUDED.email,
            phone = EXCLUDED.phone,
            document = EXCLUDED.document,
            selected_installments = EXCLUDED.selected_installments,
            selected_bank = EXCLUDED.selected_bank,
            payment_methods_allowed = EXCLUDED.payment_methods_allowed,
            metadata = EXCLUDED.metadata,
            last_step = EXCLUDED.last_step,
            origin = EXCLUDED.origin,
            created_by = EXCLUDED.created_by,
            utm_source = EXCLUDED.utm_source,
            utm_medium = EXCLUDED.utm_medium,
            utm_campaign = EXCLUDED.utm_campaign,
            utm_term = EXCLUDED.utm_term,
            utm_content = EXCLUDED.utm_content,
            referrer = EXCLUDED.referrer,
            ip = EXCLUDED.ip,
            user_agent = EXCLUDED.user_agent,
            updated_at = NOW()`,
        idForInsert,
        resumeToken,
        slug,
        clinicId,
        productId,
        offerId,
        email,
        phone,
        document,
        selectedInstallments,
        selectedBank,
        paymentMethodsAllowed as any,
        metadata as any,
        lastStep,
        origin,
        createdBy,
        utmSource,
        utmMedium,
        utmCampaign,
        utmTerm,
        utmContent,
        referrer,
        ip,
        userAgent,
        now
      );
      sess = { id: idForInsert, resumeToken } as any;
    }

    return NextResponse.json({ success: true, id: sess.id, resumeToken });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'internal_error' }, { status: 500 });
  }
}
