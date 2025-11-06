import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { postEnrollmentDeviceForEnrollment } from '@/lib/linaob';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const enrollmentId = params.id;
    const body = await req.json();
    if (!enrollmentId) return NextResponse.json({ error: 'enrollmentId ausente' }, { status: 400 });

    const fwd = (req.headers as any).get?.('x-forwarded-for') || '';
    const clientIp = typeof fwd === 'string' ? fwd.split(',')[0].trim() : undefined;
    const subTenantId = process.env.LINAOB_SUBTENANT_ID || 'lina';

    const data = await postEnrollmentDeviceForEnrollment(String(enrollmentId), body || {}, { subTenantId, clientIp });
    const authorised = String(data?.status || data?.enrollmentStatus || '').toUpperCase() === 'AUTHORISED' || String(data?.status || '').toUpperCase() === 'AUTHORIZED';

    // Update link by enrollmentId
    await prisma.openFinanceLink.updateMany({
      where: { enrollmentId: String(enrollmentId) },
      data: {
        status: authorised ? 'AUTHORISED' : 'PENDING',
        deviceBinding: data || {},
        updatedAt: new Date(),
      }
    });

    return NextResponse.json({ ok: true, enrollmentId, status: authorised ? 'AUTHORISED' : 'PENDING', providerResponse: data });
  } catch (e: any) {
    const status = Number(e?.status) || 500;
    return NextResponse.json({ ok: false, error: e?.message || 'Erro ao confirmar device', response: e?.responseJson || e?.responseText }, { status });
  }
}
