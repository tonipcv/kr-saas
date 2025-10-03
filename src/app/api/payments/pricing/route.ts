import { NextRequest, NextResponse } from 'next/server';
import { PRICING } from '@/lib/pricing';

function calcPlatformFeeCents(amountCents: number) {
  const percent = Math.round((amountCents * PRICING.PLATFORM_PERCENT_FEE_BPS) / 10000);
  return percent + PRICING.PLATFORM_FIXED_FEE_CENTS;
}

// Price table (Tabela Price) helpers
function pricePerInstallment(amountCents: number, aprMonthly: number, n: number) {
  // A = P * i * (1+i)^n / ((1+i)^n - 1)
  const P = amountCents;
  const i = aprMonthly;
  const factor = Math.pow(1 + i, n);
  const denom = factor - 1;
  if (denom <= 0) return Math.ceil(P / n);
  const A = (P * i * factor) / denom; // in cents
  return A;
}

function parsePositiveInt(v: string | null): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  const i = Math.trunc(n);
  return i > 0 ? i : undefined;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const amountCents = parsePositiveInt(searchParams.get('amount_cents'));
    const installments = parsePositiveInt(searchParams.get('installments'));

    // Always include pricing model
    const body: any = { pricing: PRICING };

    if (amountCents !== undefined) {
      const platformFeeCents = calcPlatformFeeCents(amountCents);
      body.preview = { amount_cents: amountCents, platform_fee_cents: platformFeeCents };

      if (installments !== undefined) {
        if (installments < 1 || installments > PRICING.INSTALLMENT_MAX_INSTALLMENTS) {
          return NextResponse.json({ error: 'installments out of range' }, { status: 400 });
        }
        const apr = PRICING.INSTALLMENT_CUSTOMER_APR_MONTHLY;
        // Price installment value (not rounded yet)
        const perRaw = pricePerInstallment(amountCents, apr, installments);
        // Build parcelas with floor rounding and last adjusted by remainder
        const perFloor = Math.floor(perRaw);
        const totalRounded = Math.round(perRaw * installments);
        const parcels = Array.from({ length: installments }, () => perFloor);
        const accumulated = perFloor * (installments - 1);
        parcels[installments - 1] = totalRounded - accumulated;

        body.preview.installments = {
          n: installments,
          apr_monthly: apr,
          per_installment_cents_list: parcels,
          customer_total_cents: totalRounded,
        };
      }
    }

    // If only installments provided without amount, return 400
    if (amountCents === undefined && installments !== undefined) {
      return NextResponse.json({ error: 'amount_cents is required when installments is provided' }, { status: 400 });
    }

    return NextResponse.json(body);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'internal error' }, { status: 500 });
  }
}
