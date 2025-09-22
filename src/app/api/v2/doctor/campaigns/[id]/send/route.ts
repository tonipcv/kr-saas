import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { verifyMobileAuth, unauthorizedResponse } from '@/lib/mobile-auth';
import { prisma } from '@/lib/prisma';
import { FEATURES, isFeatureEnabledForDoctor } from '@/lib/feature-flags';
import { z } from 'zod';
import { emitEvent } from '@/lib/events';
import { EventActor, EventType } from '@prisma/client';
import { decryptSecret } from '@/lib/crypto';
import { sendWhatsAppTemplate, sendWhatsAppText } from '@/lib/whatsapp';

const bodySchema = z.object({
  channel: z.enum(['whatsapp', 'email', 'sms']).default('whatsapp'),
  audienceSize: z.number().int().min(0).default(0),
  dryRun: z.boolean().optional(),
  trigger: z.string().optional(),
});

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

    // If WhatsApp channel and not dryRun but no toPreview provided, return an explicit error for MVP
    if (channel === 'whatsapp' && !dryRun && !toPreviewRaw) {
      return NextResponse.json({ success: false, error: 'toPreview is required for WhatsApp send (MVP). Preencha o campo "Para" com o número em formato internacional, ex.: 5511999999999.' }, { status: 400 });
    }
  }
  if (!userId || userRole !== 'DOCTOR') return null;
  return userId;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const doctorId = await authDoctor(request);
    if (!doctorId) return unauthorizedResponse();

    // Feature flag
    const globalEnabled = !!(FEATURES.CAMPAIGN_PAGES || FEATURES.CAMPAIGN_FORMS);
    if (!globalEnabled || !(await isFeatureEnabledForDoctor('CAMPAIGN_PAGES', doctorId))) {
      return NextResponse.json({ success: false, error: 'Feature disabled' }, { status: 403 });
    }

    const { id } = await params;
    if (!id) return NextResponse.json({ success: false, error: 'Campaign id required' }, { status: 400 });

    // Validate body
    const json = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
    }
    const { channel, audienceSize, dryRun, trigger } = parsed.data;
    const useTemplate = Boolean((json as any)?.useTemplate);
    const templateName: string | null = (json as any)?.templateName || null;
    const templateLanguage: string = (json as any)?.templateLanguage || 'pt_BR';
    const toPreviewRaw: string = (json as any)?.toPreview || '';
    const freeMessage: string = (json as any)?.message || '';

    // Ensure campaign exists and belongs to doctor
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, doctor_id, campaign_slug, status FROM campaigns WHERE id = $1 AND doctor_id = $2 LIMIT 1`,
      id,
      doctorId
    );
    const campaign = rows?.[0];
    if (!campaign) return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });

    if (dryRun) {
      return NextResponse.json({ success: true, dryRun: true, message: 'Dry run OK' });
    }

    // Resolve clinicId: prefer owned clinic; else first membership
    let clinicId: string | null = null;
    try {
      const owned = await prisma.clinic.findFirst({ where: { ownerId: doctorId }, select: { id: true } });
      if (owned?.id) clinicId = owned.id;
    } catch {}
    if (!clinicId) {
      try {
        const membership = await prisma.clinicMember.findFirst({ where: { userId: doctorId, isActive: true }, select: { clinicId: true } });
        if (membership?.clinicId) clinicId = membership.clinicId;
      } catch {}
    }

    // Emit campaign_sent (non-blocking)
    try {
      if (clinicId) {
        await emitEvent({
          eventType: EventType.campaign_sent,
          actor: EventActor.clinic,
          clinicId,
          customerId: null,
          metadata: { campaign_id: campaign.id, channel, audience_size: audienceSize, trigger },
        });
      }
    } catch (e) {
      console.error('[events] campaign_sent emit failed', e);
    }

    // MVP dispatch: if WhatsApp channel and a single preview number is provided, try immediate send
    if (channel === 'whatsapp' && !dryRun && toPreviewRaw) {
      if (!clinicId) {
        return NextResponse.json({ success: false, error: 'Clinic not resolved for doctor' }, { status: 400 });
      }
      // Load WhatsApp integration for clinic
      const rows = await prisma.$queryRawUnsafe<Array<{ api_key_enc: string; iv: string; instance_id: string | null }>>(
        `SELECT api_key_enc, iv, instance_id FROM clinic_integrations WHERE clinic_id = $1 AND provider = 'WHATSAPP' LIMIT 1`,
        clinicId,
      );
      if (!rows || rows.length === 0) {
        return NextResponse.json({ success: false, error: 'WhatsApp not configured for clinic' }, { status: 400 });
      }
      const row = rows[0];
      if (!row.instance_id) {
        return NextResponse.json({ success: false, error: 'WhatsApp phone number not set for clinic' }, { status: 400 });
      }

      const token = decryptSecret(row.iv, row.api_key_enc);
      let toPreview = (toPreviewRaw || '').toString().trim().replace(/\D+/g, '');
      if (!toPreview || toPreview.length < 10) {
        return NextResponse.json({ success: false, error: 'Invalid destination number. Use full international format, e.g., 5511999999999.' }, { status: 400 });
      }

      try {
        let waResp: any;
        if (useTemplate) {
          if (!templateName) {
            return NextResponse.json({ success: false, error: 'templateName is required when useTemplate=true' }, { status: 400 });
          }
          waResp = await sendWhatsAppTemplate(token, row.instance_id, toPreview, templateName, templateLanguage);
        } else {
          if (!freeMessage) {
            return NextResponse.json({ success: false, error: 'message is required for free-form WhatsApp messages' }, { status: 400 });
          }
          waResp = await sendWhatsAppText(token, row.instance_id, toPreview, freeMessage);
        }
        // Debug: log immediate Graph response
        try { console.log('[WA Campaign Send] immediate response', JSON.stringify(waResp)); } catch {}
        const messageId = waResp?.messages?.[0]?.id || null;
        if (!messageId) {
          const details = waResp?.error || waResp || null;
          return NextResponse.json({ success: false, error: 'WhatsApp did not return a message id', details }, { status: 400 });
        }
        return NextResponse.json({ success: true, data: { id: campaign.id, channel, audienceSize, messageId } });
      } catch (err: any) {
        const hint = useTemplate
          ? 'Check if template name/language exist and are approved for this WABA.'
          : 'If recipient did not message in the last 24h, use a pre-approved template to initiate the conversation.';
        try { console.error('[WA Campaign Send] error', err); } catch {}
        return NextResponse.json({ success: false, error: err?.message || 'WhatsApp send failed', hint }, { status: 400 });
      }
    }

    // Default placeholder response (no immediate dispatch)
    return NextResponse.json({ success: true, data: { id: campaign.id, channel, audienceSize } });
  } catch (e: any) {
    console.error('Error in POST /api/v2/doctor/campaigns/[id]/send:', e);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
