import { NextResponse } from 'next/server';
import { getEnrollment } from '@/lib/linaob';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const enrollmentId = params.id;
    const fwd = (req.headers as any).get?.('x-forwarded-for') || '';
    const clientIp = typeof fwd === 'string' ? fwd.split(',')[0].trim() : undefined;
    const subTenantId = process.env.LINAOB_SUBTENANT_ID || 'lina';
    const data = await getEnrollment(String(enrollmentId), { subTenantId, clientIp });
    return NextResponse.json({ ok: true, enrollmentId, data });
  } catch (e: any) {
    const status = Number(e?.status) || 500;
    return NextResponse.json({ ok: false, error: e?.message || 'Erro ao obter enrollment', response: e?.responseJson || e?.responseText }, { status });
  }
}
