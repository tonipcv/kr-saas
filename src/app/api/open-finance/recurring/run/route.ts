import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createRecurringPayment } from '@/lib/linaob';
import crypto from 'crypto';

function addPeriod(from: Date, periodicity: string) {
  const d = new Date(from);
  const p = String(periodicity || '').toUpperCase();
  if (p === 'DAILY') d.setDate(d.getDate() + 1);
  else if (p === 'WEEKLY') d.setDate(d.getDate() + 7);
  else if (p === 'MONTHLY') d.setMonth(d.getMonth() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

export async function POST() {
  try {
    const now = new Date();
    const due = await prisma.openFinanceConsent.findMany({
      where: {
        status: 'ACTIVE',
        OR: [
          { nextExecutionAt: { lte: now } },
          { nextExecutionAt: null }
        ]
      },
      take: 50,
    });

    const results: any[] = [];
    for (const c of due) {
      try {
        const payload: any = {
          consentId: c.consentId,
          contractId: c.contractId,
          linkId: c.linkId,
          amount: c.amountCents,
          metadata: { run: 'cron' },
        };
        const res = await createRecurringPayment(payload);
        const recurringPaymentId: string | null = res?.id || res?.recurringPaymentId || null;
        const status: string = String(res?.status || 'processing').toLowerCase();

        const txId = crypto.randomUUID();
        await prisma.$executeRawUnsafe(
          `INSERT INTO payment_transactions (id, provider, provider_order_id, doctor_id, patient_profile_id, clinic_id, product_id, amount_cents, currency, installments, payment_method_type, status, raw_payload)
           VALUES ($1, 'LINA_OB', $2, NULL, NULL, NULL, NULL, $3, 'BRL', 1, 'pix', $4, $5::jsonb)
           ON CONFLICT DO NOTHING`,
          txId,
          recurringPaymentId ? String(recurringPaymentId) : null,
          Number(c.amountCents || 0),
          status === 'paid' ? 'paid' : (status === 'failed' || status === 'canceled' ? status : 'processing'),
          JSON.stringify({ request: payload, response: res })
        );

        const next = addPeriod(now, c.periodicity);
        await prisma.openFinanceConsent.update({
          where: { id: c.id },
          data: { nextExecutionAt: next, updatedAt: new Date() },
        });

        results.push({ consentId: c.consentId, contractId: c.contractId, status: 'OK', recurringPaymentId });
      } catch (e: any) {
        results.push({ consentId: c.consentId, contractId: c.contractId, status: 'ERROR', error: e?.message || String(e) });
      }
    }

    return NextResponse.json({ ok: true, processed: results.length, results });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'cron run error' }, { status: 500 });
  }
}
