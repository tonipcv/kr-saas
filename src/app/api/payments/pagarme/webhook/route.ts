import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPagarmeWebhookSignature } from '@/lib/pagarme';

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-pagarme-signature')
      || req.headers.get('x-hub-signature-256')
      || req.headers.get('x-hub-signature')
      || undefined;

    const secretConfigured = !!process.env.PAGARME_WEBHOOK_SECRET;
    if (secretConfigured) {
      const ok = verifyPagarmeWebhookSignature(rawBody, signature || undefined);
      if (!ok) {
        return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
      }
    } else {
      // Dev/Test mode: accept webhook without signature validation
      console.warn('[pagarme][webhook] No PAGARME_WEBHOOK_SECRET configured; skipping signature verification. Do not use this in production.');
    }

    const event = JSON.parse(rawBody || '{}');
    const type = String(event?.type || event?.event || '');

    // Example handlers (adjust to actual Pagar.me event schema)
    if (type.includes('recipient')) {
      const recipientId = event?.data?.id || event?.recipient?.id || event?.object?.id;
      const remoteStatus = event?.data?.status || event?.recipient?.status || event?.object?.status || '';
      if (recipientId) {
        const merchant = await prisma.merchant.findFirst({ where: { recipientId } });
        if (merchant) {
          const normalized: 'ACTIVE' | 'PENDING' | 'REJECTED' = remoteStatus === 'active' ? 'ACTIVE' : remoteStatus === 'rejected' ? 'REJECTED' : 'PENDING';
          await prisma.merchant.update({
            where: { clinicId: merchant.clinicId },
            data: { status: normalized, lastSyncAt: new Date() }
          });
        }
      }
    }

    // Add transaction events processing as needed

    return NextResponse.json({ received: true });
  } catch (e) {
    console.error('[pagarme][webhook] error', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
