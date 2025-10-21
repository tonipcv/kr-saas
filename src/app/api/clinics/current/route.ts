import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Selecionar a melhor clínica do médico:
    // Prioridade:
    // 1) Subscrição ACTIVE com plano pago (monthly_price > 0)
    // 2) Subscrição ACTIVE (mesmo se preço 0)
    // 3) Subscrição TRIAL
    // 4) Sem subscrição -> clínica mais recente
    const rows = await prisma.$queryRaw<
      { id: string; name: string; slug: string | null }[]
    >`
      WITH user_clinics AS (
        -- Clínicas onde o usuário é owner OU membro ativo
        SELECT c.*,
               CASE WHEN c."ownerId" = ${session.user.id} THEN 1 ELSE 0 END as is_owner
        FROM clinics c
        WHERE c."isActive" = true
          AND (
            c."ownerId" = ${session.user.id}
            OR EXISTS (
              SELECT 1 FROM clinic_members cm
              WHERE cm."clinicId" = c.id
                AND cm."userId" = ${session.user.id}
                AND cm."isActive" = true
            )
          )
      ), latest_sub AS (
        SELECT cs.*,
               ROW_NUMBER() OVER (PARTITION BY cs.clinic_id ORDER BY cs.created_at DESC) AS rn
        FROM clinic_subscriptions cs
      ), ranked AS (
        SELECT 
          uc.id,
          uc.name,
          uc.slug,
          ls.status::text as status,
          cp.monthly_price,
          CASE 
            WHEN ls.status = 'ACTIVE' AND cp.monthly_price IS NOT NULL AND cp.monthly_price > 0 THEN 3
            WHEN ls.status = 'ACTIVE' THEN 2
            WHEN ls.status = 'TRIAL' THEN 1
            ELSE 0
          END AS priority,
          uc.is_owner,
          uc."createdAt" as clinic_created_at,
          ls.created_at as sub_created_at
        FROM user_clinics uc
        LEFT JOIN latest_sub ls ON ls.clinic_id = uc.id AND ls.rn = 1
        LEFT JOIN clinic_plans cp ON cp.id = ls.plan_id
      )
      SELECT id, name, slug
      FROM ranked
      ORDER BY priority DESC, is_owner DESC, COALESCE(sub_created_at, clinic_created_at) DESC
      LIMIT 1
    `;

    const clinic = rows[0] || null;
    if (!clinic) {
      // Extra diagnostics to help understand why there is no clinic
      const [ownedCount, memberCount] = await Promise.all([
        prisma.clinic.count({ where: { ownerId: session.user.id, isActive: true } }).catch(() => 0),
        prisma.clinicMember.count({ where: { userId: session.user.id, isActive: true } }).catch(() => 0),
      ]);
      let role: string | null = null;
      try {
        const u = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
        role = u?.role ?? null;
      } catch {}
      return NextResponse.json(
        {
          error: 'Nenhuma clínica encontrada',
          details: {
            userId: session.user.id,
            role,
            ownedClinics: ownedCount,
            memberClinics: memberCount,
            hint: 'Crie uma clínica em /business/clinic ou inicie o fluxo de assinatura em /clinic/planos-trial',
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ clinic });
  } catch (e: any) {
    console.error('[clinics/current][GET] error', e);
    return NextResponse.json(
      {
        error: 'Internal error',
        message: e?.message || null,
        code: e?.code || null,
        details: {
          name: e?.name || null,
          meta: e?.meta || null,
        },
      },
      { status: 500 }
    );
  }
}
