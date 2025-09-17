import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { verifyMobileAuth, unauthorizedResponse } from '@/lib/mobile-auth';
import { prisma } from '@/lib/prisma';
import { FEATURES, isFeatureEnabledForDoctor } from '@/lib/feature-flags';
import { z } from 'zod';
import { emitEvent } from '@/lib/events';
import { EventActor, EventType } from '@prisma/client';

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
  }
  if (!userId || userRole !== 'DOCTOR') return null;
  return userId;
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const doctorId = await authDoctor(request);
    if (!doctorId) return unauthorizedResponse();

    // Feature flag
    const globalEnabled = !!(FEATURES.CAMPAIGN_PAGES || FEATURES.CAMPAIGN_FORMS);
    if (!globalEnabled || !(await isFeatureEnabledForDoctor('CAMPAIGN_PAGES', doctorId))) {
      return NextResponse.json({ success: false, error: 'Feature disabled' }, { status: 403 });
    }

    const id = params.id;
    if (!id) return NextResponse.json({ success: false, error: 'Campaign id required' }, { status: 400 });

    // Validate body
    const json = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
    }
    const { channel, audienceSize, dryRun, trigger } = parsed.data;

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

    // Placeholder: actual dispatch to be implemented by the integration layer
    return NextResponse.json({ success: true, data: { id: campaign.id, channel, audienceSize } });
  } catch (e: any) {
    console.error('Error in POST /api/v2/doctor/campaigns/[id]/send:', e);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
