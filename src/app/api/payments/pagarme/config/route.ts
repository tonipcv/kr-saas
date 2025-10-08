import { NextResponse } from 'next/server';
import { isV5 } from '@/lib/pagarme';

export async function GET() {
  try {
    const ENABLE_SPLIT = String(process.env.PAGARME_ENABLE_SPLIT || '').toLowerCase() === 'true';
    const baseUrl = process.env.PAGARME_BASE_URL || '';
    const authScheme = (process.env.PAGARME_AUTH_SCHEME || 'basic').toLowerCase();
    const accountId = process.env.PAGARME_ACCOUNT_ID || '';

    return NextResponse.json({
      isV5: isV5(),
      enableSplit: ENABLE_SPLIT,
      baseUrl,
      authScheme,
      accountId: accountId || null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro interno' }, { status: 500 });
  }
}
