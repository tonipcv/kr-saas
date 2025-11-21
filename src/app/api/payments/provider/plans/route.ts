import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { pagarmeCreatePlan, isV5 } from '@/lib/payments/pagarme/sdk';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const ENABLED = String(process.env.PAGARME_ENABLE_SUBSCRIPTIONS || '').toLowerCase() === 'true';
    if (!ENABLED) {
      return NextResponse.json({ error: 'Assinaturas desabilitadas' }, { status: 400 });
    }

    const body = await req.json();
    const { productId, interval, intervalCount, trialDays, priceCents } = body || {};
    if (!productId) return NextResponse.json({ error: 'productId é obrigatório' }, { status: 400 });

    const product = await prisma.product.findUnique({ where: { id: String(productId) } });
    if (!product) return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 });

    // Validate type = SUBSCRIPTION via Prisma enum value
    if ((product as any).type !== 'SUBSCRIPTION') {
      return NextResponse.json({ error: 'Produto não é do tipo SUBSCRIPTION' }, { status: 400 });
    }

    // Check clinic membership for current user
    let clinicId: string | null = (product as any)?.clinicId || null;
    if (!clinicId && (product as any)?.doctorId) {
      const clinic = await prisma.clinic.findFirst({ where: { ownerId: String((product as any).doctorId) }, select: { id: true } });
      clinicId = clinic?.id || null;
    }
    if (!clinicId) return NextResponse.json({ error: 'Clínica não encontrada para o produto' }, { status: 400 });

    const membership = await prisma.clinicMember.findFirst({ where: { clinicId, userId: session.user.id, isActive: true } });
    if (!membership) return NextResponse.json({ error: 'Não autorizado para esta clínica' }, { status: 403 });

    if (!isV5()) return NextResponse.json({ error: 'Pagar.me v5 não configurado' }, { status: 400 });

    // Prepare plan payload for v5
    const cents = Number.isFinite(Number(priceCents)) && Number(priceCents) > 0
      ? Math.round(Number(priceCents))
      : Math.round(Number(product.price as any) * 100);

    const planPayload: any = {
      name: (product as any)?.name || 'Plano',
      amount: cents,
      interval: String(interval || (product as any)?.interval || 'MONTH').toLowerCase(),
      interval_count: Number(intervalCount || (product as any)?.intervalCount || 1),
      trial_period_days: Number(trialDays || (product as any)?.trialDays || 0),
      // optional: payment_methods, pricing_schema, etc.
      metadata: {
        productId: String(productId),
        clinicId: clinicId,
      }
    };

    const created = await pagarmeCreatePlan(planPayload);
    const providerPlanId = created?.id || created?.plan?.id || null;

    const updated = await prisma.product.update({
      where: { id: String(productId) },
      data: {
        providerPlanId,
        providerPlanData: created || {},
      }
    });

    return NextResponse.json({ success: true, product: updated, providerPlanId, providerResponse: created });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro interno do servidor' }, { status: 500 });
  }
}
