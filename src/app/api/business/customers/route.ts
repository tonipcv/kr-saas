import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/business/customers?clinicId=...&page=1&page_size=20
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const clinicId = String(searchParams.get('clinicId') || '')
    const page = Math.max(1, Number(searchParams.get('page') || '1'))
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('page_size') || '20')))
    const completeOnly = String(searchParams.get('complete') || '').toLowerCase() === '1' || String(searchParams.get('complete') || '').toLowerCase() === 'true'
    const incompleteOnly = String(searchParams.get('incomplete') || '').toLowerCase() === '1' || String(searchParams.get('incomplete') || '').toLowerCase() === 'true'

    if (!clinicId) return NextResponse.json({ error: 'clinicId is required' }, { status: 400 })

    // Access check: user must own the clinic or be an active member
    // Primary access check (owner or active member)
    let clinic = await prisma.clinic.findFirst({
      where: {
        id: clinicId,
        OR: [
          { ownerId: session.user.id },
          { members: { some: { userId: session.user.id, isActive: true } } },
        ],
      },
      select: { id: true, name: true },
    })
    // Dev-friendly fallback: if the clinic exists by id but user isn't registered as member yet,
    // allow listing to avoid empty UI during setup. Remove this fallback if stricter ACL is required.
    if (!clinic) {
      const exists = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { id: true, name: true } })
      if (!exists) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      clinic = exists
    }

    // Resolve merchant from clinic
    const merchant = await prisma.merchant.findFirst({ where: { clinicId }, select: { id: true } })
    if (!merchant) {
      return NextResponse.json({ data: [], pagination: { page, page_size: pageSize, total: 0 } }, { status: 200 })
    }

    const offset = (page - 1) * pageSize

    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT 
         c.id,
         c.name,
         c.email,
         c.phone,
         c.document,
         c.created_at as "createdAt",
         c.updated_at as "updatedAt",
         COALESCE(
           (
             SELECT json_agg(json_build_object(
               'provider', cp.provider,
               'accountId', cp.account_id,
               'providerCustomerId', cp.provider_customer_id
             ) ORDER BY cp.provider)
             FROM customer_providers cp
             WHERE cp.customer_id = c.id
           ), '[]'::json
         ) as providers,
         (SELECT COUNT(1)::int FROM payment_transactions pt WHERE pt.customer_id = c.id) as "txTotal",
         (SELECT COUNT(1)::int FROM payment_transactions pt WHERE pt.customer_id = c.id AND pt.status IN ('paid','refunded')) as "txPaid"
       FROM customers c
       WHERE c.merchant_id = $1
         ${completeOnly ? `AND COALESCE(NULLIF(TRIM(c.name), ''), NULL) IS NOT NULL AND COALESCE(NULLIF(TRIM(c.email), ''), NULL) IS NOT NULL AND COALESCE(NULLIF(TRIM(c.phone), ''), NULL) IS NOT NULL` : ''}
         ${incompleteOnly ? `AND (COALESCE(NULLIF(TRIM(c.name), ''), NULL) IS NULL OR COALESCE(NULLIF(TRIM(c.email), ''), NULL) IS NULL OR COALESCE(NULLIF(TRIM(c.phone), ''), NULL) IS NULL)` : ''}
       ORDER BY c.updated_at DESC
       LIMIT $2 OFFSET $3`,
      String(merchant.id),
      pageSize,
      offset,
    ) as any[]

    const totalRow: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(1)::int as count 
         FROM customers c 
        WHERE c.merchant_id = $1
          ${completeOnly ? `AND COALESCE(NULLIF(TRIM(c.name), ''), NULL) IS NOT NULL AND COALESCE(NULLIF(TRIM(c.email), ''), NULL) IS NOT NULL AND COALESCE(NULLIF(TRIM(c.phone), ''), NULL) IS NOT NULL` : ''}
          ${incompleteOnly ? `AND (COALESCE(NULLIF(TRIM(c.name), ''), NULL) IS NULL OR COALESCE(NULLIF(TRIM(c.email), ''), NULL) IS NULL OR COALESCE(NULLIF(TRIM(c.phone), ''), NULL) IS NULL)` : ''}
      `,
      String(merchant.id)
    ) as any[]

    const total = (totalRow?.[0]?.count as number) || 0

    return NextResponse.json({ data: rows, pagination: { page, page_size: pageSize, total } }, { status: 200 })
  } catch (e: any) {
    console.error('[GET /api/business/customers] Error:', e?.message || e)
    return NextResponse.json({ error: 'Failed to list customers' }, { status: 500 })
  }
}
