import { NextResponse } from 'next/server';
import { getEnrollmentByUser } from '@/lib/linaob';

export async function GET(req: Request, { params }: { params: { cpf: string } }) {
  try {
    const cpf = params.cpf;
    const url = new URL(req.url);
    const deviceId = url.searchParams.get('deviceId') || undefined;
    const subTenantId = process.env.LINAOB_SUBTENANT_ID || 'lina';
    const data = await getEnrollmentByUser(String(cpf), deviceId, { subTenantId });
    return NextResponse.json({ ok: true, cpf, deviceId, data });
  } catch (e: any) {
    const status = Number(e?.status) || 500;
    return NextResponse.json({ ok: false, error: e?.message || 'Erro ao obter enrollment por usuário', response: e?.responseJson || e?.responseText }, { status });
  }
}
