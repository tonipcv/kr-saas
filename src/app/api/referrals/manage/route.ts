import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { REFERRAL_STATUS, CREDIT_STATUS } from '@/lib/referral-utils';
import { sendCreditNotification } from '@/lib/referral-email-service';

// GET - Listar indicações do médico
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const skip = (page - 1) * limit;

    // Filtros
    const where: any = {
      doctorId: session.user.id
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

    // Resolver campanhas (nome) em lote a partir de customFields
    const campaignIds: string[] = [];
    const campaignSlugs: string[] = [];
    for (const l of leads as any[]) {
      const cf = (l as any).customFields || {};
      const cid = cf.campaignId as string | undefined;
      const cslug = cf.campaignSlug as string | undefined;
      if (cid && !campaignIds.includes(cid)) campaignIds.push(cid);
      if (cslug && !campaignSlugs.includes(cslug)) campaignSlugs.push(cslug);
    }

    let campaignRows: Array<{ id: string; campaign_slug: string; title: string | null }> = [];
    if (campaignIds.length > 0 || campaignSlugs.length > 0) {
      const whereParts: string[] = ['doctor_id = $1'];
      const params: any[] = [session.user.id];
      let paramIndex = 2;
      if (campaignIds.length > 0) {
        const placeholders = campaignIds.map(() => `$${paramIndex++}`).join(',');
        whereParts.push(`id IN (${placeholders})`);
        params.push(...campaignIds);
      }
      if (campaignSlugs.length > 0) {
        const placeholders = campaignSlugs.map(() => `$${paramIndex++}`).join(',');
        whereParts.push(`campaign_slug IN (${placeholders})`);
        params.push(...campaignSlugs);
      }
      const whereSql = `WHERE ${whereParts.join(' AND ')}`;
      campaignRows = await prisma.$queryRawUnsafe(
        `SELECT id, campaign_slug, title FROM campaigns ${whereSql}`,
        ...params
      );
    }

    const byId = new Map<string, { id: string; slug: string; title: string | null }>();
    const bySlug = new Map<string, { id: string; slug: string; title: string | null }>();
    for (const r of campaignRows as any[]) {
      const entry = { id: String(r.id), slug: String(r.campaign_slug), title: r.title as string | null };
      byId.set(entry.id, entry);
      bySlug.set(entry.slug, entry);
    }

    // Transformar dados para formato esperado pelo frontend
    const transformedLeads = (leads as any[]).map(lead => {
      const cf = (lead as any).customFields || {};
      const cid = cf.campaignId as string | undefined;
      const cslug = cf.campaignSlug as string | undefined;
      const found = (cid && byId.get(cid)) || (cslug && bySlug.get(cslug)) || null;
      return {
        ...lead,
        campaign: found ? { id: found.id, slug: found.slug, title: found.title || found.slug } : (cslug ? { id: '', slug: cslug, title: cslug } : null),
        referrer: (lead as any).User_referral_leads_referrerIdToUser,
        credits: (lead as any).referral_credits.map((credit: any) => ({
          id: credit.id,
          amount: credit.amount,
          status: credit.isUsed ? 'USED' : 'AVAILABLE'
        }))
      };
    });

    // Estatísticas (contagens)
    const stats = await prisma.referralLead.groupBy({
      by: ['status'],
      where: { doctorId: session.user.id },
      _count: { id: true }
    });

    // Agregados de valor (somatório do customFields.offer.amount) para PostgreSQL (JSONB)
    const [pendingRow] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COALESCE(SUM(COALESCE(("customFields"->'offer'->>'amount')::numeric, 0)), 0) as total
       FROM referral_leads
       WHERE "doctorId" = $1 AND status IN ('NEW','PENDING','CONTACTED')`,
      session.user.id
    );
    const [obtainedRow] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COALESCE(SUM(COALESCE(("customFields"->'offer'->>'amount')::numeric, 0)), 0) as total
       FROM referral_leads
       WHERE "doctorId" = $1 AND status = 'CONVERTED'`,
      session.user.id
    );

    const statsFormatted = {
      total: total,
      pending: stats.find(s => s.status === 'PENDING')?._count.id || 0,
      contacted: stats.find(s => s.status === 'CONTACTED')?._count.id || 0,
      converted: stats.find(s => s.status === 'CONVERTED')?._count.id || 0,
      rejected: stats.find(s => s.status === 'REJECTED')?._count.id || 0,
      pendingValue: Number(pendingRow?.total || 0),
      obtainedValue: Number(obtainedRow?.total || 0),
    };

    return NextResponse.json({
      leads: transformedLeads,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      stats: statsFormatted
    });

  } catch (error) {
    console.error('Erro ao buscar indicações:', error instanceof Error ? error.message : 'Erro desconhecido');
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

// PUT - Atualizar status de uma indicação
export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { leadId, status, notes, offerAmount } = await req.json();

    if (!leadId || !status) {
      return NextResponse.json(
        { error: 'leadId e status são obrigatórios' },
        { status: 400 }
      );
    }

    // Verificar se a indicação pertence ao médico
    const lead = await prisma.referralLead.findFirst({
      where: {
        id: leadId,
        doctorId: session.user.id
      },
      include: {
        User_referral_leads_referrerIdToUser: { select: { id: true, name: true, email: true } }
      }
    });

    if (!lead) {
      return NextResponse.json(
        { error: 'Indicação não encontrada' },
        { status: 404 }
      );
    }

    // Preparar atualização de customFields.offer.amount (opcional)
    let customFieldsUpdate: any | undefined = undefined;
    const amountNum = offerAmount !== undefined && offerAmount !== null && offerAmount !== ''
      ? Number(offerAmount)
      : undefined;
    if (amountNum !== undefined && Number.isFinite(amountNum) && amountNum >= 0) {
      const existingCF: any = (lead as any).customFields || {};
      const existingOffer: any = (existingCF.offer as any) || {};
      customFieldsUpdate = {
        ...existingCF,
        offer: {
          ...existingOffer,
          amount: amountNum,
        },
      };
    }

    // Atualizar status e, se houver, customFields
    const updatedLead = await prisma.referralLead.update({
      where: { id: leadId },
      data: {
        status,
        notes: notes || lead.notes,
        lastContactDate: new Date(),
        ...(customFieldsUpdate ? { customFields: customFieldsUpdate } : {}),
      }
    });

    // Se convertido para CONVERTED, criar crédito
    if (status === REFERRAL_STATUS.CONVERTED && lead.status !== REFERRAL_STATUS.CONVERTED) {
      // Verificar se já não existe crédito
      const existingCredit = await prisma.referralCredit.findFirst({
        where: { referralLeadId: leadId }
      });

      if (!existingCredit && lead.User_referral_leads_referrerIdToUser) {
        const credit = await prisma.referralCredit.create({
          data: {
            userId: lead.User_referral_leads_referrerIdToUser.id,
            referralLeadId: lead.id,
            amount: 1,
            type: 'SUCCESSFUL_REFERRAL',
            description: 'Crédito por indicação convertida'
          }
        });

        // Enviar notificação de crédito
        sendCreditNotification(credit.id).catch(error => {
          console.error('Erro ao enviar notificação de crédito:', error instanceof Error ? error.message : 'Erro desconhecido');
        });
      }
    }

    return NextResponse.json({
      success: true,
      lead: updatedLead
    });

  } catch (error) {
    console.error('Erro ao atualizar indicação:', error instanceof Error ? error.message : 'Erro desconhecido');
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
} 