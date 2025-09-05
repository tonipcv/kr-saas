import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { REFERRAL_STATUS, CREDIT_STATUS } from '@/lib/referral-utils';
import { sendCreditNotification } from '@/lib/referral-email-service';
import { Prisma } from '@prisma/client';
import { recalculateMembershipLevel } from '@/lib/membership';

// GET - Listar indicações do médico
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const clinicId = searchParams.get('clinicId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const skip = (page - 1) * limit;

    // Verify clinic access if clinicId is provided
    if (clinicId) {
      const hasAccess = await prisma.clinic.findFirst({
        where: {
          id: clinicId,
          OR: [
            { ownerId: session.user.id },
            {
              members: {
                some: {
                  userId: session.user.id,
                  isActive: true
                }
              }
            }
          ]
        }
      });

      if (!hasAccess) {
        return NextResponse.json({ error: 'Access denied to this clinic' }, { status: 403 });
      }
    }

    // Filtros
    const where: any = {
      doctorId: session.user.id,
      ...(clinicId && { clinicId }),
    };

    if (status && status !== 'ALL') {
      where.status = status;
    }

    // Buscar indicações
    const [leads, total] = await Promise.all([
      prisma.referralLead.findMany({
        where,
        include: {
          User_referral_leads_referrerIdToUser: {
            select: { id: true, name: true, email: true }
          },
          convertedUser: {
            select: { id: true, name: true, email: true }
          },
          referral_credits: {
            select: { id: true, amount: true, isUsed: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.referralLead.count({ where })
    ]);

    // Calculate stats
    const stats = {
      total,
      pending: 0,
      contacted: 0,
      converted: 0,
      rejected: 0,
      expired: 0,
      pendingValue: 0,
      obtainedValue: 0
    };

    // Update stats based on leads
    leads.forEach((lead: any) => {
      stats[lead.status.toLowerCase()] = (stats[lead.status.toLowerCase()] || 0) + 1;
      
      // Calculate values
      const creditValue = lead.creditValue || 0;
      if (lead.status === 'CONVERTED' && lead.creditAwarded) {
        stats.obtainedValue += Number(creditValue);
      } else if (lead.status !== 'REJECTED' && lead.status !== 'EXPIRED') {
        stats.pendingValue += Number(creditValue);
      }
    });

    return NextResponse.json({
      leads,
      stats,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error in GET /api/referrals/manage:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}