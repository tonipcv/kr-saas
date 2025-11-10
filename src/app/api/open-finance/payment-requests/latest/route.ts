import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Returns the latest non-terminal Open Finance payment request persisted locally
// Query params (optional): state, orderRef, userId
// Terminal statuses considered: COMPLETED, REJECTED, CANCELLED, EXPIRED
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const state = searchParams.get('state') || undefined;
    const orderRef = searchParams.get('orderRef') || undefined;
    const userId = searchParams.get('userId') || undefined;

    const terminal = ['COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED'];

    // Build dynamic WHERE with priority: orderRef, then userId, then state (stored in metadata if present)
    // Cast enum column to text for comparison with string parameters
    const wheres: string[] = [
      `status::text NOT IN (${terminal.map((_, i) => `$${i + 1}`).join(',')})`,
    ];
    const params: any[] = terminal;

    if (orderRef) { wheres.push(`order_ref = $${params.length + 1}`); params.push(orderRef); }
    if (userId) { wheres.push(`user_id = $${params.length + 1}`); params.push(userId); }
    if (state) { wheres.push(`metadata::text ILIKE $${params.length + 1}`); params.push(`%${state}%`); }

    const whereSql = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';

    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT payment_link_id as "paymentLinkId",
              redirect_uri as "redirectUri",
              order_ref as "orderRef",
              status,
              expires_at as "expiresAt",
              created_at as "createdAt",
              updated_at as "updatedAt"
         FROM openbanking_payments
         ${whereSql}
         ORDER BY updated_at DESC
         LIMIT 1`
      , ...params
    );

    const row = rows?.[0] || null;
    if (!row) return NextResponse.json({ found: false });

    return NextResponse.json({ found: true, ...row });
  } catch (e: any) {
    console.error('[of.payments.latest][error]', e?.message || e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}
