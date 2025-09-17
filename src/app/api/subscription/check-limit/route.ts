import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canAddPatient, canCreateReferral, canCreateReward, hasAccessPurchaseCredits, hasAccessCampaigns } from '@/lib/subscription';
import { SubscriptionService } from '@/services/subscription';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Não autorizado' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const clinicIdParam = searchParams.get('clinicId') || undefined;

    if (!type) {
      return NextResponse.json(
        { error: 'Tipo de verificação não especificado' },
        { status: 400 }
      );
    }

    let result;

    switch (type) {
      case 'patients':
        // Prefer new subscription usage service scoped to the user's clinic
        try {
          // Resolve clinicId: allow explicit param when user is member; else fallback to first membership
          let clinicId: string | null = null;
          if (clinicIdParam) {
            const access = await prisma.clinicMember.findFirst({ where: { userId: session.user.id, clinicId: clinicIdParam, isActive: true }, select: { clinicId: true } });
            if (access?.clinicId) clinicId = access.clinicId;
          }
          if (!clinicId) {
            const member = await prisma.clinicMember.findFirst({ where: { userId: session.user.id, isActive: true }, select: { clinicId: true } });
            if (member?.clinicId) clinicId = member.clinicId;
          }
          if (clinicId) {
            const svc = new SubscriptionService();
            const usage = await svc.getSubscriptionUsage(clinicId);
            if (usage?.usage?.patients) {
              const current = Number(usage.usage.patients.current || 0);
              const limit = Number(usage.usage.patients.limit || 0);
              result = { allowed: current < limit, current, limit, message: current < limit ? undefined : `Limite de ${limit} pacientes atingido. Faça upgrade do seu plano.` } as any;
              break;
            }
          }
        } catch (e) {
          // fall through to legacy
        }
        // Fallback to legacy computation
        {
          const legacy = await canAddPatient(session.user.id);
          // Try to attach usage numbers when possible using first accessible clinic
          try {
            const member = await prisma.clinicMember.findFirst({ where: { userId: session.user.id, isActive: true }, select: { clinicId: true } });
            if (member?.clinicId) {
              const svc = new SubscriptionService();
              const usage = await svc.getSubscriptionUsage(member.clinicId);
              if (usage?.usage?.patients) {
                const current = Number(usage.usage.patients.current || 0);
                const limit = Number(usage.usage.patients.limit || 0);
                result = { allowed: legacy.allowed, current, limit, message: legacy.message } as any;
                break;
              }
            }
          } catch {}
          result = legacy;
        }
        break;
      case 'referrals':
        result = await canCreateReferral(session.user.id);
        break;
      case 'rewards':
        result = await canCreateReward(session.user.id);
        break;
      case 'purchase-credits':
        result = await hasAccessPurchaseCredits(session.user.id);
        break;
      case 'campaigns':
        result = await hasAccessCampaigns(session.user.id);
        break;
      default:
        return NextResponse.json(
          { error: 'Tipo de verificação inválido' },
          { status: 400 }
        );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Erro ao verificar limite:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}