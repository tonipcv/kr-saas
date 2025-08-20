import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sendRewardVerificationEmail } from '@/lib/referral-email-service';
import { randomBytes } from 'crypto';

// POST /api/referrals/rewards/verify-code
// Body: { code: string; email: string }
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.debug('[verify-code] session', {
      doctorId: session.user.id,
      doctorEmail: session.user.email
    });

    const { code, email } = await req.json();
    if (!code || !email) {
      return NextResponse.json({ error: 'code and email are required' }, { status: 400 });
    }
    
    const codeNorm = String(code).trim().toUpperCase();
    const emailNorm = String(email).trim().toLowerCase();
    console.debug('[verify-code] input', { codeNorm, emailNorm });

    // 1) Validate and identify the reward from the provided code
    const codeRow = await prisma.referralRewardCode.findUnique({
      where: { code: codeNorm },
      select: { id: true, code: true, status: true, rewardId: true, redemptionId: true, reward: { select: { doctorId: true, title: true, costInCredits: true } } }
    });
    console.debug('[verify-code] codeRow', codeRow ? {
      id: codeRow.id,
      status: codeRow.status,
      rewardId: codeRow.rewardId,
      redemptionId: codeRow.redemptionId,
      rewardDoctorId: codeRow.reward?.doctorId,
      rewardTitle: codeRow.reward?.title
    } : null);

    if (!codeRow) {
      return NextResponse.json({ error: 'Invalid reward code.' }, { status: 400 });
    }
    if (codeRow.reward?.doctorId !== session.user.id) {
      return NextResponse.json({ error: 'This code does not belong to one of your rewards.' }, { status: 403 });
    }

    // 2) Find patient by email
    const patient = await prisma.user.findFirst({
      where: { email: emailNorm },
      select: { id: true, name: true, email: true }
    });
    console.debug('[verify-code] patient', patient ? { id: patient.id, email: patient.email } : null);

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found for this email.' }, { status: 404 });
    }

    // 3) Require an existing PENDING redemption for this patient and reward
    const pending = await prisma.rewardRedemption.findFirst({
      where: {
        userId: patient.id,
        status: 'PENDING',
        rewardId: codeRow.rewardId,
      },
      orderBy: { redeemedAt: 'desc' }
    });
    console.debug('[verify-code] pending', pending ? { id: pending.id, status: pending.status } : null);

    if (!pending) {
      // No PENDING found. Check if there is already APPROVED/FULFILLED for this patient/reward
      const approved = await prisma.rewardRedemption.findFirst({
        where: {
          userId: patient.id,
          rewardId: codeRow.rewardId,
          status: { in: ['APPROVED', 'FULFILLED'] }
        },
        orderBy: { redeemedAt: 'desc' }
      });
      console.debug('[verify-code] approved', approved ? { id: approved.id, status: approved.status } : null);

      if (approved) {
        if (codeRow.status === 'USED' && codeRow.redemptionId === approved.id) {
          console.debug('[verify-code] already approved for this redemption and code matches');
          return NextResponse.json({
            success: true,
            alreadyApproved: true,
            message: 'This redemption has already been approved for this patient and this code is already linked to the redemption.'
          });
        }
        if (codeRow.status === 'USED' && codeRow.redemptionId && codeRow.redemptionId !== approved.id) {
          console.debug('[verify-code] code used in different redemption', { codeRedemptionId: codeRow.redemptionId, approvedId: approved.id });
          return NextResponse.json({ error: 'This code has already been used in another redemption.' }, { status: 400 });
        }
        // There is an approved redemption but the provided code is not linked to it
        console.debug('[verify-code] approved exists but code not linked to it');
        return NextResponse.json({
          error: 'The patient already has an approved redemption for this reward. No verification needed.'
        }, { status: 409 });
      }

      return NextResponse.json({
        error: 'No pending redemption found for this patient for this reward. Ask the patient to initiate the redemption in the app before verifying the code.'
      }, { status: 404 });
    }

    // Reserve the code for this redemption if still UNUSED; if USED by another, fail
    if (codeRow.status === 'USED' && codeRow.redemptionId && codeRow.redemptionId !== pending.id) {
      console.debug('[verify-code] code used in another pending redemption mismatch', { codeRedemptionId: codeRow.redemptionId, pendingId: pending.id });
      return NextResponse.json({ error: 'This code has already been used in another redemption.' }, { status: 400 });
    }
    if (codeRow.status === 'UNUSED') {
      const updated = await prisma.referralRewardCode.updateMany({
        where: { id: codeRow.id, status: 'UNUSED' },
        data: { status: 'USED', redemptionId: pending.id }
      });
      if (updated.count !== 1) {
        console.debug('[verify-code] failed to reserve code due to race condition');
        return NextResponse.json({ error: 'Failed to reserve the code. Please try again.' }, { status: 409 });
      }
    }

    const redemptionId = pending.id;

    // 4) Create verification token (reusing VerificationToken table)
    const token = randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
    const identifier = `reward-confirm:${redemptionId}`;

    // Limpar tokens antigos para o mesmo resgate
    await prisma.verificationToken.deleteMany({ where: { identifier } }).catch(() => {});

    await prisma.verificationToken.create({
      data: { identifier, token, expires }
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const confirmUrl = `${baseUrl}/api/referrals/rewards/confirm?token=${encodeURIComponent(token)}&rid=${encodeURIComponent(redemptionId)}`;

    await sendRewardVerificationEmail({
      to: patient.email!,
      doctorName: null,
      rewardTitle: codeRow.reward?.title || null,
      confirmUrl
    });

    console.debug('[verify-code] success: token created and email enqueued', { redemptionId });
    return NextResponse.json({ success: true, message: 'Confirmation email sent to the patient. Code reserved for this redemption.' });
  } catch (error: any) {
    const message = error?.message || 'Internal server error';
    console.error('[verify-code] error', message, { stack: error?.stack });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
