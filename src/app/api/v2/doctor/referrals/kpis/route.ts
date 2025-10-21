import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Ensure user is a doctor
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, role: true }
    });

    if (!user || user.role !== 'DOCTOR') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const doctorId = user.id;
    const { searchParams } = new URL(req.url);
    const clinicId = (searchParams.get('clinicId') || '').trim() || null;
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    const to = toParam ? new Date(toParam) : new Date();
    const from = fromParam ? new Date(fromParam) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    // If clinicId provided, verify access (owner or active member)
    if (clinicId) {
      const hasAccess = await prisma.clinic.findFirst({
        where: {
          id: clinicId,
          OR: [
            { ownerId: doctorId },
            { members: { some: { userId: doctorId, isActive: true } } },
          ],
        },
        select: { id: true },
      });
      if (!hasAccess) {
        return NextResponse.json({ error: 'Access denied to this clinic' }, { status: 403 });
      }
    }

    // Leads Recebidos (clinic scope when available, last 30 days window by default)
    const leadsRecebidos = await prisma.referralLead.count({
      where: clinicId ? {
        clinicId,
        createdAt: { gte: from, lte: to },
      } as any : {
        doctorId,
        createdAt: { gte: from, lte: to },
      }
    });

    // Leads Convertidos (via convertedUserId or status CONVERTED)
    const leadsConvertidos = await prisma.referralLead.count({
      where: clinicId ? {
        clinicId,
        createdAt: { gte: from, lte: to },
        OR: [
          { convertedUserId: { not: null } },
          { status: 'CONVERTED' }
        ]
      } as any : {
        doctorId,
        createdAt: { gte: from, lte: to },
        OR: [
          { convertedUserId: { not: null } },
          { status: 'CONVERTED' }
        ]
      }
    });

    // Valor Gerado (alinhado com /api/referrals/manage):
    // soma de customFields.offer.amount para leads CONVERTED do médico
    const [obtainedRow] = clinicId
      ? await prisma.$queryRawUnsafe<any[]>(
          `SELECT COALESCE(SUM(COALESCE(("customFields"->'offer'->>'amount')::numeric, 0)), 0) as total
           FROM referral_leads
           WHERE clinic_id = $1 AND status = 'CONVERTED'`,
           clinicId
        )
      : await prisma.$queryRawUnsafe<any[]>(
          `SELECT COALESCE(SUM(COALESCE(("customFields"->'offer'->>'amount')::numeric, 0)), 0) as total
           FROM referral_leads
           WHERE "doctorId" = $1 AND status = 'CONVERTED'`,
           doctorId
        );
    const valorGerado = Number(obtainedRow?.total || 0);

    // Recompensas Pendentes: reward_redemptions com status PENDING para rewards do médico
    const recompensasPendentes = await prisma.rewardRedemption.count({
      where: {
        status: 'PENDING',
        reward: { doctorId }
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        leadsRecebidos,
        leadsConvertidos,
        valorGerado,
        recompensasPendentes
      }
    });
  } catch (error) {
    console.error('Error fetching referral KPIs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
