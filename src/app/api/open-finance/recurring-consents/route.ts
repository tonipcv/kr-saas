import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createJSRConsent } from '@/lib/linaob';

function addPeriod(from: Date, periodicity: string) {
  const d = new Date(from);
  const p = String(periodicity || '').toUpperCase();
  if (p === 'WEEKLY') d.setDate(d.getDate() + 7);
  else if (p === 'MONTHLY') d.setMonth(d.getMonth() + 1);
  else if (p === 'DAILY') d.setDate(d.getDate() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // Expecting JSR consent payload with payment {...}, organisationId, authorisationServerId, enrollmentId, fidoSignOptions
    const { payment, organisationId, authorisationServerId, enrollmentId, linkId, periodicity, amountCents, metadata } = body || {};
    if (!payment || !organisationId || !authorisationServerId || !enrollmentId) {
      return NextResponse.json({ error: 'payment, organisationId, authorisationServerId e enrollmentId são obrigatórios' }, { status: 400 });
    }

    const fwd = (req.headers as any).get?.('x-forwarded-for') || '';
    const clientIp = typeof fwd === 'string' ? fwd.split(',')[0].trim() : undefined;
    const subTenantId = process.env.LINAOB_SUBTENANT_ID || 'lina';

    const payload = { payment, organisationId, authorisationServerId, enrollmentId, fidoSignOptions: body?.fidoSignOptions } as any;
    const res = await createJSRConsent(payload, { subTenantId, clientIp });
    const consentId: string | null = res?.consentId || res?.id || null;
    const contractId: string | null = res?.contractId || res?.contract_id || null;
    const status: string = String(res?.status || 'ACTIVE');

    const inferredAmountCents = Number(amountCents ?? Math.round(Number(payment?.value || 0) * 100));
    const inferredPeriodicity = String(periodicity || 'MONTHLY');
    const nextExecutionAt = addPeriod(new Date(), inferredPeriodicity);

    const saved = await prisma.openFinanceConsent.upsert({
      where: { linkId: String(linkId) },
      update: {
        consentId: String(consentId || ''),
        contractId: String(contractId || ''),
        status,
        amountCents: inferredAmountCents,
        periodicity: inferredPeriodicity,
        nextExecutionAt,
        metadata: metadata || { payment },
        updatedAt: new Date(),
      },
      create: {
        linkId: String(linkId),
        consentId: String(consentId || ''),
        contractId: String(contractId || ''),
        status,
        amountCents: inferredAmountCents,
        periodicity: inferredPeriodicity,
        nextExecutionAt,
        metadata: metadata || { payment },
      },
    });

    return NextResponse.json({ ok: true, consent: saved, providerResponse: res });
  } catch (e: any) {
    const status = Number(e?.status) || 500;
    return NextResponse.json({ ok: false, error: e?.message || 'Erro ao criar consentimento', response: e?.responseJson || e?.responseText }, { status });
  }
}
