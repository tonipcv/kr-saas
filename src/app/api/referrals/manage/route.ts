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
    // When clinicId is provided and access is validated, list all referrals for that clinic (any doctor inside)
    // Otherwise, default to this doctor's own referrals
    const where: any = clinicId
      ? { clinicId }
      : { doctorId: session.user.id };

    if (status && status !== 'ALL') {
      where.status = status;
    }

    // Buscar indicações
    const [rawLeads, total] = await Promise.all([
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

    // Shape leads for UI (add `referrer` field) and update stats
    const leads = (rawLeads as any[]).map((l) => ({
      ...l,
      referrer: l.User_referral_leads_referrerIdToUser || null,
    }));

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

// PUT - Atualizar status da indicação (e campos opcionais)
export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const leadId = String(body.leadId || '').trim();
    const status = String(body.status || '').trim().toUpperCase();
    const notes = typeof body.notes === 'string' ? body.notes : undefined;
    const offerAmount = typeof body.offerAmount === 'number' ? body.offerAmount : undefined;

    if (!leadId) {
      return NextResponse.json({ error: 'leadId é obrigatório' }, { status: 400 });
    }
    const allowedStatuses = new Set(['PENDING', 'CONTACTED', 'CONVERTED', 'REJECTED', 'EXPIRED']);
    if (!status || !allowedStatuses.has(status)) {
      return NextResponse.json({ error: 'status inválido' }, { status: 400 });
    }

    // Load lead and verify access
    const lead = await prisma.referralLead.findUnique({
      where: { id: leadId },
      select: { id: true, doctorId: true, clinicId: true, customFields: true },
    });
    if (!lead) {
      return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 });
    }

    let hasAccess = lead.doctorId === session.user.id;
    if (!hasAccess && lead.clinicId) {
      const clinic = await prisma.clinic.findFirst({
        where: {
          id: lead.clinicId,
          OR: [
            { ownerId: session.user.id },
            { members: { some: { userId: session.user.id, isActive: true } } },
          ],
        },
        select: { id: true },
      });
      hasAccess = !!clinic;
    }
    if (!hasAccess) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    // Build update payload, merging customFields
    const existing = (lead.customFields as any) || {};
    const mergedCustom: any = { ...existing };
    if (typeof notes === 'string') {
      mergedCustom.notes = notes;
    }
    if (typeof offerAmount === 'number') {
      mergedCustom.offer = { ...(existing.offer || {}), amount: offerAmount };
    }

    const updated = await prisma.referralLead.update({
      where: { id: leadId },
      data: {
        status,
        ...(Object.keys(mergedCustom).length ? { customFields: mergedCustom } : {}),
      },
      select: { id: true, status: true },
    });

    return NextResponse.json({ success: true, lead: updated });
  } catch (error) {
    console.error('Error in PUT /api/referrals/manage:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}