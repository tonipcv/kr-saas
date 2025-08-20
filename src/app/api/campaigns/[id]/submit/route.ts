import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { FEATURES, isFeatureEnabledForDoctor } from '@/lib/feature-flags';
import { isExistingPatient, getUserByReferralCode, generateUniqueReferralCode } from '@/lib/referral-utils';
import { sendReferralNotification } from '@/lib/referral-email-service';

// Helper to ensure campaign features are enabled
async function ensureFeatureEnabled(doctorId: string) {
  const globalEnabled = !!(FEATURES.CAMPAIGN_PAGES || FEATURES.CAMPAIGN_FORMS);
  if (!globalEnabled) {
    console.error('[campaigns-submit] Feature disabled (global flags)', {
      doctorId,
      flags: {
        CAMPAIGN_PAGES: FEATURES.CAMPAIGN_PAGES,
        CAMPAIGN_FORMS: FEATURES.CAMPAIGN_FORMS,
        CAMPAIGN_PREVIEW: FEATURES.CAMPAIGN_PREVIEW,
      },
    });
    return false;
  }
  const perDoctor = await isFeatureEnabledForDoctor('CAMPAIGN_PAGES', doctorId);
  if (!perDoctor) {
    console.error('[campaigns-submit] Feature disabled for doctor (allowlist)', {
      doctorId,
      needed: 'doctor_feature_flags: CAMPAIGN_PAGES=true',
    });
    return false;
  }
  return true;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const campaignId = params.id;
    if (!campaignId) {
      return NextResponse.json({ success: false, error: 'Campaign id is required' }, { status: 400 });
    }

    const url = new URL(request.url);
    const preview = url.searchParams.get('preview') === '1';

    // Load campaign via SQL (no Prisma model)
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, doctor_id, campaign_slug, status, valid_from, valid_until, form_config
       FROM campaigns WHERE id = $1 LIMIT 1`,
      campaignId
    );

    const campaign = rows?.[0];
    if (!campaign) {
      return NextResponse.json({ success: false, error: 'Campanha não encontrada' }, { status: 404 });
    }

    const doctorId: string = campaign.doctor_id;

    // Feature flags
    if (!(await ensureFeatureEnabled(doctorId))) {
      return NextResponse.json({ success: false, error: 'Feature disabled' }, { status: 403 });
    }

    // Validate status and dates (unless preview and preview feature enabled)
    const now = new Date();
    const statusOk = campaign.status === 'PUBLISHED' || (preview && FEATURES.CAMPAIGN_PREVIEW);
    const withinDates = (!campaign.valid_from || new Date(campaign.valid_from) <= now) &&
                        (!campaign.valid_until || new Date(campaign.valid_until) >= now);

    if (!statusOk || (!withinDates && !(preview && FEATURES.CAMPAIGN_PREVIEW))) {
      return NextResponse.json({ success: false, error: 'Campanha indisponível' }, { status: 403 });
    }

    // Parse body
    const body = await request.json();
    const { name, email, phone, message, form_data, consents } = body || {};
    // Accept referrer code from body or query (referrerCode | ref)
    const referrerCode: string | null = (body?.referrerCode || body?.ref || url.searchParams.get('referrerCode') || url.searchParams.get('ref') || '').toString() || null;

    if (!name || !email) {
      return NextResponse.json({ success: false, error: 'Nome e email são obrigatórios' }, { status: 400 });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ success: false, error: 'Email inválido' }, { status: 400 });
    }

    // Reject existing patients of this doctor
    const existingPatient = await isExistingPatient(email, doctorId);
    if (existingPatient) {
      return NextResponse.json({ success: false, error: 'Esta pessoa já é paciente deste médico' }, { status: 400 });
    }

    // Idempotency: if lead already exists and is pending/contacted, acknowledge without error
    const existingLead = await prisma.referralLead.findFirst({
      where: {
        email,
        doctorId,
        status: { in: ['PENDING', 'CONTACTED'] },
      },
      select: { id: true, status: true },
    });

    if (existingLead) {
      return NextResponse.json({
        success: true,
        message: 'Lead já existente para este email',
        alreadyExists: true,
        leadId: existingLead.id,
      });
    }

    // Resolve referrer by code if provided and valid for this doctor
    let referrer: any = null;
    if (referrerCode) {
      try {
        const r = await getUserByReferralCode(referrerCode);
        if (r) {
          // Validate that referrer belongs to the same doctor (directly or via relationships/prescriptions)
          let isReferrerPatientOfDoctor = (r as any).doctor_id === doctorId;
          if (!isReferrerPatientOfDoctor && !(r as any).doctor_id) {
            const linkViaPrescription = await prisma.protocolPrescription.findFirst({
              where: {
                user_id: (r as any).id,
                OR: [
                  { prescribed_by: doctorId as string },
                  { protocol: { doctor_id: doctorId as string } },
                ],
              },
              select: { id: true },
            });
            isReferrerPatientOfDoctor = !!linkViaPrescription;
            if (!isReferrerPatientOfDoctor) {
              const rel = await prisma.doctorPatientRelationship.findFirst({
                where: { patientId: (r as any).id, doctorId: doctorId as string, isActive: true },
                select: { id: true },
              });
              isReferrerPatientOfDoctor = !!rel;
            }
          }
          if (isReferrerPatientOfDoctor) {
            referrer = r;
          }
        }
      } catch (e) {
        // ignore invalid referrer silently for campaigns
      }
    }

    // Generate unique referralCode for the lead
    let leadReferralCode: string | null = null;
    {
      let isUnique = false;
      let attempts = 0;
      while (!isUnique && attempts < 10) {
        const candidate = generateUniqueReferralCode();
        const exists = await prisma.referralLead.findFirst({ where: { referralCode: candidate }, select: { id: true } });
        if (!exists) {
          leadReferralCode = candidate;
          isUnique = true;
        }
        attempts++;
      }
    }

    // Collect UTM and tracking from query, cookie, and referer header
    const qp = {
      utm_source: url.searchParams.get('utm_source') || undefined,
      utm_medium: url.searchParams.get('utm_medium') || undefined,
      utm_campaign: url.searchParams.get('utm_campaign') || undefined,
      utm_term: url.searchParams.get('utm_term') || undefined,
      utm_content: url.searchParams.get('utm_content') || undefined,
      ref: url.searchParams.get('ref') || undefined,
      referrerCode: url.searchParams.get('referrerCode') || undefined,
    } as Record<string, string | undefined>;

    // Cookie fallback
    let cookieData: Record<string, string> = {};
    try {
      const rawCookie = request.cookies.get('cxl_campaign_tracking')?.value;
      if (rawCookie) {
        const decoded = decodeURIComponent(rawCookie);
        const parsed = JSON.parse(decoded);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          cookieData = parsed as Record<string, string>;
        }
      }
    } catch {}

    // Referer header fallback
    const refererHeader = request.headers.get('referer') || undefined;

    // Merge precedence: query params > cookie > referer
    const utm = {
      ...cookieData,
      ...(refererHeader ? { referer: refererHeader } : {}),
      ...qp,
    } as Record<string, string | undefined>;

    // Extract offer snapshot from campaign.form_config (if provided by doctor)
    let offerSnapshot: { amount?: number } | undefined;
    try {
      const cfg = typeof campaign.form_config === 'string' ? JSON.parse(campaign.form_config) : (campaign.form_config || {});
      const off = cfg?.offer || {};
      const amount = typeof off.amount === 'string' ? Number(off.amount) : (typeof off.amount === 'number' ? off.amount : undefined);
      if (amount != null && !Number.isNaN(amount)) {
        offerSnapshot = { amount };
      }
    } catch (_) {}

    // Create lead with source campaign_form
    let lead;
    try {
      lead = await prisma.referralLead.create({
        data: {
          name,
          email,
          phone,
          message,
          status: 'PENDING',
          source: 'campaign_form',
          doctorId,
          referralCode: leadReferralCode || undefined,
          referrerId: referrer?.id || undefined,
          // Keep useful context in custom fields
          customFields: {
            campaignId: campaign.id,
            campaignSlug: campaign.campaign_slug,
            formData: form_data || null,
            consents: consents || null,
            tracking: utm,
            referrerCodeProvided: referrerCode || undefined,
            offer: offerSnapshot || undefined,
          },
        },
        select: { id: true, createdAt: true, customFields: true },
      });
    } catch (createErr: any) {
      // Unique constraint on (email, doctorId)
      const message: string = (createErr && createErr.message) || '';
      if (message.includes('ReferralLead_email_doctorId_key') || message.includes('Unique constraint') || message.includes('P2002')) {
        const dup = await prisma.referralLead.findFirst({ where: { email, doctorId }, select: { id: true, status: true } });
        return NextResponse.json({
          success: true,
          message: 'Lead já existente para este email',
          alreadyExists: true,
          leadId: dup?.id || null,
        });
      }
      throw createErr;
    }

    // Generate a unique coupon code (exclusive per lead)
    let couponCode: string | null = null;
    {
      let isUnique = false;
      let attempts = 0;
      while (!isUnique && attempts < 10) {
        const candidate = generateUniqueReferralCode();
        // ensure uniqueness across leads' customFields.coupon.code
        const exists: any[] = await prisma.$queryRawUnsafe(
          `SELECT id FROM referral_leads WHERE ("customFields"->'coupon'->>'code') = $1 LIMIT 1`,
          candidate
        );
        if (!exists || exists.length === 0) {
          couponCode = candidate;
          isUnique = true;
        }
        attempts++;
      }
    }

    if (couponCode) {
      try {
        await prisma.referralLead.update({
          where: { id: lead.id },
          data: {
            customFields: {
              ...(lead as any).customFields,
              coupon: {
                code: couponCode,
                type: 'DISCOUNT',
                amount: offerSnapshot?.amount ?? null,
                createdAt: new Date().toISOString(),
              },
            },
          },
        });
      } catch (e) {
        console.error('[campaigns-submit] Failed to persist coupon on lead', e);
      }
    }

    // Fire and forget notification (keeps parity with referrals submit)
    sendReferralNotification(lead.id).catch((error) => {
      console.error('[campaigns-submit] Erro ao enviar notificação:', error instanceof Error ? error.message : 'Erro desconhecido');
    });

    return NextResponse.json({
      success: true,
      message: 'Lead de campanha enviado com sucesso',
      data: { id: lead.id, coupon: couponCode ? { code: couponCode, amount: offerSnapshot?.amount ?? null } : null },
    }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/campaigns/[id]/submit:', error);
    return NextResponse.json({ success: false, error: 'Erro interno do servidor' }, { status: 500 });
  }
}
