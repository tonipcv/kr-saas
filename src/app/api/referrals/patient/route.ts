import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getUserCreditsBalance, ensureUserHasReferralCode } from '@/lib/referral-utils';
import { emitEvent } from '@/lib/events';
import { EventActor, EventType } from '@prisma/client';
import { verifyMobileAuth } from '@/lib/mobile-auth';

// GET - Patient dashboard (credits, referrals, rewards)
export async function GET(request: NextRequest) {
  try {
    // Try web authentication first
    const session = await getServerSession(authOptions);
    let userId = session?.user?.id;

    // If no web session, try mobile authentication
    if (!userId) {
      const mobileUser = await verifyMobileAuth(request);
      if (mobileUser) {
        userId = mobileUser.id;
      }
    }
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Ensure user is a patient
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { 
        role: true,
        doctor_id: true,
        referral_code: true
      }
    });

    if (!user || user.role !== 'PATIENT') {
      return NextResponse.json({ error: 'Access denied. Patients only.' }, { status: 403 });
    }

    // Ensure the user has a referral code
    let referralCode;
    try {
      referralCode = await ensureUserHasReferralCode(userId);
      
    } catch (referralError) {
      console.error('Error generating referral code:', referralError instanceof Error ? referralError.message : String(referralError));
      // If it fails, use the user’s existing code or null
      referralCode = (user as any)?.referral_code || null;
    }

    // Get current credits balance
    const creditsBalance = await getUserCreditsBalance(userId);

    // Get credits history
    const creditsHistory = await prisma.referralCredit.findMany({
      where: { userId: userId },
      include: {
        referral_leads: {
          select: { name: true, email: true, status: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    // Build displayDescription for PURCHASE credits
    // Handles new format: "Créditos por compra: <qty>x <name>"
    // Handles legacy format: "Créditos por compra do produto <productId> (qtd <n>)"
    const productIdRegex = /produto\s+([a-z0-9]+)\b/i;
    const qtyRegex = /qtd\s*(\d+)/i;

    // Collect product IDs from legacy descriptions
    const legacyProductIds: string[] = [];
    for (const credit of creditsHistory) {
      if ((credit.type || '').toUpperCase().includes('PURCHASE') && credit.description) {
        const desc = credit.description;
        const hasNewFormat = /:\s*\d+x\s+.+/i.test(desc);
        if (!hasNewFormat) {
          const idMatch = desc.match(productIdRegex);
          if (idMatch && idMatch[1]) legacyProductIds.push(idMatch[1]);
        }
      }
    }

    // Fetch product names in bulk
    const uniqueIds = Array.from(new Set(legacyProductIds));
    const productsById: Record<string, { id: string; name: string | null }> = {};
    if (uniqueIds.length > 0) {
      const prods = await prisma.product.findMany({
        where: { id: { in: uniqueIds } },
        select: { id: true, name: true }
      });
      for (const p of prods) productsById[p.id] = { id: p.id, name: p.name };
    }

    // Get referrals made by the user
    const referralsMade = await prisma.referralLead.findMany({
      where: { referrerId: userId },
      include: {
        doctor: {
          select: { id: true, name: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    // Resolve patient's doctor (for header and rewards)
    // 1) Try via user.doctor_id
    // 2) Fallback: primary+active relationship, else active, else any
    let resolvedDoctor: { id: string; name: string | null; email: string | null; image: string | null; doctor_slug?: string | null } | null = null;
    if ((user as any)?.doctor_id) {
      const doc = await prisma.user.findUnique({
        where: { id: (user as any).doctor_id as string },
        select: { id: true, name: true, email: true, image: true, doctor_slug: true }
      });
      if (doc) resolvedDoctor = doc as any;
    }
    if (!resolvedDoctor) {
      const rels = await prisma.doctorPatientRelationship.findMany({
        where: { patientId: userId },
        include: { doctor: { select: { id: true, name: true, email: true, image: true, doctor_slug: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
      const primaryActive = rels.find(r => (r as any)?.isPrimary && (r as any)?.isActive && (r as any)?.doctor);
      const active = rels.find(r => (r as any)?.isActive && (r as any)?.doctor);
      const anyRel = rels.find(r => (r as any)?.doctor);
      const chosen: any = primaryActive || active || anyRel || null;
      if (chosen?.doctor) {
        resolvedDoctor = {
          id: chosen.doctor.id,
          name: chosen.doctor.name,
          email: chosen.doctor.email,
          image: chosen.doctor.image as any,
          doctor_slug: (chosen.doctor as any)?.doctor_slug || null,
        };
      }
    }
    const doctorInfo: { id: string; name: string | null; email: string | null; image: string | null } | null = resolvedDoctor
      ? { id: resolvedDoctor.id, name: resolvedDoctor.name, email: resolvedDoctor.email, image: resolvedDoctor.image as any }
      : null;

    // Fetch available rewards (from the resolved doctor for the patient)
    let availableRewards: any[] = [];
    const resolvedDoctorId = (resolvedDoctor as any)?.id || (user as any)?.doctor_id || null;
    if (resolvedDoctorId) {
      availableRewards = await prisma.referralReward.findMany({
        where: {
          doctorId: resolvedDoctorId,
          isActive: true
        },
        include: {
          // Include only approved/fulfilled redemptions so pending ones don’t block
          redemptions: {
            where: { status: { in: ['APPROVED', 'FULFILLED'] } },
            select: { id: true }
          }
        },
        orderBy: { costInCredits: 'asc' }
      });
    }

    // Fetch redemptions history
    const redemptionsHistory = await prisma.rewardRedemption.findMany({
      where: { userId: userId },
      include: {
        reward: {
          select: { title: true, description: true, costInCredits: true, imageUrl: true }
        }
      },
      orderBy: { redeemedAt: 'desc' },
      take: 10
    });

    // Stats
    const stats = {
      totalReferrals: referralsMade.length,
      convertedReferrals: referralsMade.filter(r => r.status === 'CONVERTED').length,
      totalCreditsEarned: creditsHistory.reduce((sum, credit: any) => sum + Number(credit.amount), 0),
      totalCreditsUsed: redemptionsHistory.reduce((sum, redemption: any) => sum + Number(redemption.creditsUsed), 0),
      currentBalance: creditsBalance
    };

    return NextResponse.json({
      stats,
      creditsBalance,
      creditsHistory: creditsHistory.map((credit: any) => {
        let displayDescription: string | null = null;
        const typeUp = (credit.type || '').toUpperCase();
        const desc: string = credit.description || '';
        if (typeUp.includes('PURCHASE') && desc) {
          // New format: "...: <qty>x <name>" -> keep minimal
          const afterColonIdx = desc.indexOf(':');
          const tail = afterColonIdx >= 0 ? desc.slice(afterColonIdx + 1).trim() : desc.trim();
          const newFmt = tail.match(/^(\d+)x\s+(.+)$/i);
          if (newFmt) {
            const qty = newFmt[1];
            let name = newFmt[2];
            name = name.replace(/\(\s*qtd\s*\d+\s*\)$/i, '').trim();
            displayDescription = `${qty}x ${name}`;
          } else {
            // Legacy: contains product id and (qtd n)
            const idMatch = desc.match(productIdRegex);
            const qtyMatch = desc.match(qtyRegex);
            const pid = idMatch?.[1];
            const qty = qtyMatch?.[1] || '1';
            if (pid) {
              const prod = productsById[pid];
              const name = (prod?.name || pid).trim();
              displayDescription = `${qty}x ${name}`;
            }
          }
        }
        return {
          id: credit.id,
          amount: Number(credit.amount),
          type: credit.type,
          description: credit.description || null,
          displayDescription,
          createdAt: credit.createdAt,
          lead: credit.referral_leads ? {
            name: credit.referral_leads.name,
            email: credit.referral_leads.email,
            status: credit.referral_leads.status
          } : null
        };
      }),
      referralsMade: referralsMade.map((referral: any) => ({
        id: referral.id,
        name: referral.name,
        email: referral.email,
        status: referral.status,
        createdAt: referral.createdAt,
        doctor: referral.doctor,
        credits: (creditsHistory as any[]).filter((c: any) => c.referralLeadId === referral.id).map((c: any) => ({
          id: c.id,
          amount: Number(c.amount),
          status: c.isUsed ? 'USED' : 'AVAILABLE'
        }))
      })),
      availableRewards: availableRewards.map((reward: any) => ({
        id: reward.id,
        title: reward.title,
        description: reward.description,
        creditsRequired: Number(reward.costInCredits),
        maxRedemptions: reward.maxRedemptions,
        currentRedemptions: Array.isArray((reward as any).redemptions) ? (reward as any).redemptions.length : 0,
        isActive: reward.isActive,
        imageUrl: (reward as any).imageUrl || null
      })),
      redemptionsHistory: redemptionsHistory.map((redemption: any) => ({
        id: redemption.id,
        creditsUsed: Number(redemption.creditsUsed),
        status: redemption.status,
        redeemedAt: redemption.redeemedAt,
        uniqueCode: redemption.uniqueCode || null,
        reward: {
          title: redemption.reward.title,
          description: redemption.reward.description,
          creditsRequired: Number(redemption.reward.costInCredits),
          imageUrl: (redemption.reward as any)?.imageUrl || null
        }
      })),
      doctorId: resolvedDoctorId,
      doctorName: doctorInfo?.name || null,
      doctor: doctorInfo,
      doctorSlug: (resolvedDoctor as any)?.doctor_slug || null,
      referralCode: referralCode
    });

  } catch (error) {
    console.error('Error fetching patient data:', error instanceof Error ? error.message : String(error));
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Redeem reward
export async function POST(req: NextRequest) {
  try {
    // Try web authentication first
    const session = await getServerSession(authOptions);
    let userId = session?.user?.id;

    // If no web session, try mobile authentication
    if (!userId) {
      const mobileUser = await verifyMobileAuth(req);
      if (mobileUser) {
        userId = mobileUser.id;
      }
    }
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Ensure user is a patient
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });

    if (!user || user.role !== 'PATIENT') {
      return NextResponse.json({ error: 'Access denied. Only patients can redeem rewards.' }, { status: 403 });
    }

    const { rewardId } = await req.json();

    if (!rewardId) {
      return NextResponse.json(
        { error: 'Reward ID is required' },
        { status: 400 }
      );
    }

    // Fetch reward
    const reward = await prisma.referralReward.findUnique({
      where: { id: rewardId },
      include: {
        _count: {
          select: { redemptions: true }
        }
      }
    });

    if (!reward) {
      return NextResponse.json(
        { error: 'Reward not found' },
        { status: 404 }
      );
    }

    if (!(reward as any).isActive) {
      return NextResponse.json(
        { error: 'Reward is not active' },
        { status: 400 }
      );
    }

    // Check if redemption limit has been reached
    if ((reward as any).maxRedemptions && reward._count.redemptions >= (reward as any).maxRedemptions) {
      return NextResponse.json(
        { error: 'Redemption limit reached for this reward' },
        { status: 400 }
      );
    }

    // Check if the user has enough credits
    const creditsBalance = await getUserCreditsBalance(userId);
    if (creditsBalance < Number((reward as any).costInCredits)) {
      return NextResponse.json(
        { error: `Insufficient credits. You have ${creditsBalance}, but need ${Number((reward as any).costInCredits)}` },
        { status: 400 }
      );
    }

    // Check if the user redeemed this recently
    // Removed 24h cooldown: multiple redemptions are allowed if there are points and availability

    // Create redemption and reserve credits in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create PENDING redemption
      const redemption = await tx.rewardRedemption.create({
        data: {
          userId: userId,
          rewardId: rewardId,
          creditsUsed: (reward as any).costInCredits,
          status: 'PENDING'
        }
      });

      // Select available (unused) credits
      const availableCredits = await tx.referralCredit.findMany({
        where: { userId: userId, isUsed: false },
        orderBy: { createdAt: 'asc' }
      });

      let needed = Number((reward as any).costInCredits);
      let reserved = 0;

      for (const credit of availableCredits) {
        if (needed <= 0) break;

        const creditAmt = Number(credit.amount);
        const useAmt = Math.min(creditAmt, needed);

        if (creditAmt <= needed + 1e-9) {
          // Consume the entire credit
          await tx.referralCredit.update({
            where: { id: credit.id },
            data: {
              isUsed: true,
              usedAt: new Date(),
              usedForRewardId: redemption.id
            }
          });
        } else {
          // Partial consumption: split the credit
          // 1) Reduce the original credit
          await tx.referralCredit.update({
            where: { id: credit.id },
            data: {
              amount: creditAmt - useAmt,
            }
          });
          // 2) Create a new record representing the used portion
          await tx.referralCredit.create({
            data: {
              userId: credit.userId,
              amount: useAmt,
              type: credit.type,
              description: credit.description || `Partial use for redemption ${redemption.id}`,
              referralLeadId: credit.referralLeadId || null,
              isUsed: true,
              usedAt: new Date(),
              usedForRewardId: redemption.id,
            }
          });
        }

        reserved += useAmt;
        needed -= useAmt;
      }

      if (needed > 0) {
        // Revert creation if not enough could be reserved (race condition)
        throw new Error('Insufficient credits at redemption time. Please try again.');
      }

      // Do not increment currentRedemptions while PENDING; availability is based on APPROVED/FULFILLED
      return redemption;
    });

    // Analytics: reward_claimed (non-blocking)
    try {
      // Resolve clinicId from resolvedDoctorId if possible
      let clinicId: string | null = null;
      const doctorId = (resolvedDoctorId as any) || null;
      if (doctorId) {
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
      }
      if (clinicId) {
        await emitEvent({
          eventType: EventType.reward_claimed,
          actor: EventActor.customer,
          clinicId,
          customerId: userId,
          metadata: { reward_id: result.rewardId },
        });
      }
    } catch (e) {
      console.error('[events] reward_claimed emit failed', e);
    }

    return NextResponse.json({
      success: true,
      redemption: result,
      message: 'Reward redeemed successfully! Your points have been reserved. Please wait for your doctor’s confirmation.'
    });

  } catch (error) {
    console.error('Error redeeming reward:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
 