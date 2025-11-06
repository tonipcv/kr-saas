import { NextResponse } from 'next/server';
import { postEnrollmentDeviceOptions } from '@/lib/linaob';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // Expected provider payload: { state, code, idToken, tenantId, platform }
    if (!body?.state || !body?.code || !body?.idToken) {
      return NextResponse.json({ ok: false, error: 'state, code e idToken são obrigatórios' }, { status: 400 });
    }

    const fwd = (req.headers as any).get?.('x-forwarded-for') || '';
    const clientIp = typeof fwd === 'string' ? fwd.split(',')[0].trim() : undefined;

    const res = await postEnrollmentDeviceOptions(body, { clientIp });
    return NextResponse.json({ ok: true, providerResponse: res });
  } catch (e: any) {
    const status = Number(e?.status) || 500;
    return NextResponse.json({ ok: false, error: e?.message || 'Erro ao obter device options', response: e?.responseJson || e?.responseText }, { status });
  }
}
