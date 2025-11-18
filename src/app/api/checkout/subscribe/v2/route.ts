import { NextResponse } from 'next/server';
import { getAdapterForClinic } from '@/lib/providers/factory';
import { CreateSubscriptionInput } from '@/lib/providers/types';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Expect normalized input for v2
    const {
      clinicId,
      customerId,
      offerId,
      amount,
      currency = 'BRL',
      interval = 'month',
      customer,
      paymentMethod,
      metadata,
    } = body || {};

    if (!clinicId) return NextResponse.json({ error: 'clinicId is required' }, { status: 400 });
    if (!customerId) return NextResponse.json({ error: 'customerId is required' }, { status: 400 });
    if (!offerId) return NextResponse.json({ error: 'offerId is required' }, { status: 400 });
    if (!amount || amount <= 0) return NextResponse.json({ error: 'amount must be > 0 (in cents)' }, { status: 400 });
    if (!customer?.email || !customer?.name || !customer?.document) {
      return NextResponse.json({ error: 'customer must have name, email and document' }, { status: 400 });
    }
    if (!paymentMethod?.type) return NextResponse.json({ error: 'paymentMethod.type is required' }, { status: 400 });

    const adapter = await getAdapterForClinic(String(clinicId));

    const input: CreateSubscriptionInput = {
      clinicId: String(clinicId),
      customerId: String(customerId),
      offerId: String(offerId),
      amount: Number(amount),
      currency: String(currency),
      interval,
      customer,
      paymentMethod,
      metadata,
    };

    const result = await adapter.createSubscription(input);
    return NextResponse.json({ success: true, subscription: result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'subscribe v2 failed' }, { status: 500 });
  }
}
