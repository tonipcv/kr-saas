import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(_req: NextRequest) {
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

    // Leads Recebidos
    const leadsRecebidos = await prisma.referralLead.count({
      where: { doctorId }
    });

    // Leads Convertidos (via convertedUserId or status CONVERTED)
    const leadsConvertidos = await prisma.referralLead.count({
      where: {
        doctorId,
        OR: [
          { convertedUserId: { not: null } },
          { status: 'CONVERTED' }
        ]
      }
    });

    // Valor Gerado (alinhado com /api/referrals/manage):
    // soma de customFields.offer.amount para leads CONVERTED do médico
    const [obtainedRow] = await prisma.$queryRawUnsafe<any[]>(
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
