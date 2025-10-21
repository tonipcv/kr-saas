import { NextResponse } from 'next/server';
import { pagarmeGetOrder } from '@/lib/pagarme';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 });

    const order = await pagarmeGetOrder(id);
    console.log('[checkout][status] order details', {
      id: order?.id,
      status: order?.status,
      metadata: order?.metadata || null,
      items: order?.items?.map((item: any) => ({
        id: item?.id,
        code: item?.code,
        description: item?.description,
        amount: item?.amount,
        metadata: item?.metadata || null
      })),
      charges: order?.charges?.map((ch: any) => ({
        id: ch?.id,
        status: ch?.status,
        amount: ch?.amount,
        paid_amount: ch?.paid_amount
      }))
    });
    
    const pay = Array.isArray(order?.payments) ? order.payments[0] : null;
    const tx = pay?.last_transaction || pay?.transaction || null;

    const pix = pay?.payment_method === 'pix' ? {
      qr_code_url: tx?.qr_code_url || null,
      qr_code: tx?.qr_code || null,
      status: tx?.status || pay?.status || order?.status || null,
      expires_in: pay?.pix?.expires_in ?? null,
      expires_at: pay?.pix?.expires_at ?? null,
    } : null;

    return NextResponse.json({ success: true, order_status: order?.status, payment_status: pay?.status, pix, order });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro ao consultar pedido' }, { status: Number(e?.status) || 500 });
  }
}
