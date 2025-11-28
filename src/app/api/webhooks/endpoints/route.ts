import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateSecret } from '@/lib/webhooks/signature'
import { checkClinicAccess } from '@/lib/auth/check-clinic-access'

// GET /api/webhooks/endpoints?clinicId=...&enabled=true|false
export async function GET(req: Request) {
  const url = new URL(req.url)
  const clinicId = url.searchParams.get('clinicId') || ''
  const enabledParam = url.searchParams.get('enabled')
  const enabled = enabledParam === null ? undefined : enabledParam === 'true'

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!clinicId || !(await checkClinicAccess(session.user.id, clinicId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let endpoints: any[] = []
  const hasModel = (prisma as any)?.webhookEndpoint && typeof (prisma as any).webhookEndpoint.findMany === 'function'
  if (hasModel) {
    endpoints = await (prisma as any).webhookEndpoint.findMany({
      where: { clinicId, ...(enabled === undefined ? {} : { enabled }) },
      orderBy: { createdAt: 'desc' },
    })
  } else {
    // Fallback for hot processes that haven't picked up the new Prisma Client yet
    const whereClauses: string[] = ['clinic_id = $1']
    const params: any[] = [clinicId]
    if (enabled !== undefined) { whereClauses.push('enabled = $2'); params.push(enabled) }
    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : ''
    endpoints = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id,
              clinic_id as "clinicId",
              name,
              url,
              events,
              enabled,
              max_concurrent_deliveries as "maxConcurrentDeliveries",
              category_filter as "categoryFilter",
              status_filters as "statusFilters",
              product_filters as "productFilters",
              created_at as "createdAt",
              updated_at as "updatedAt"
         FROM webhook_endpoints
         ${whereSql}
     ORDER BY created_at DESC`,
      ...params
    ).catch(() => [])
  }

  // Attach simple stats (best-effort)
  const ids = endpoints.map((e) => e.id)
  const stats = ids.length
    ? await prisma.$queryRawUnsafe<any[]>(
        `SELECT endpoint_id, COUNT(*) as total, COUNT(*) FILTER (WHERE status='DELIVERED') as delivered,
                MAX(delivered_at) as last_delivery_at
           FROM outbound_webhook_deliveries
          WHERE endpoint_id = ANY($1)
          GROUP BY endpoint_id`,
        ids
      ).catch(() => [])
    : []
  const statsMap = new Map(stats.map((r: any) => [String(r.endpoint_id), r]))

  return NextResponse.json({
    endpoints: endpoints.map((e) => ({
      id: e.id,
      clinicId: e.clinicId,
      name: e.name,
      url: e.url,
      events: e.events,
      enabled: e.enabled,
      maxConcurrentDeliveries: e.maxConcurrentDeliveries ?? 5,
      categoryFilter: e.categoryFilter ?? 'all',
      statusFilters: Array.isArray(e.statusFilters) ? e.statusFilters : [],
      productFilters: Array.isArray(e.productFilters) ? e.productFilters : [],
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      stats: (() => {
        const s = statsMap.get(e.id)
        return s
          ? {
              totalDeliveries: Number(s.total || 0),
              successRate: Number(s.delivered || 0) / Math.max(1, Number(s.total || 0)),
              lastDeliveryAt: s.last_delivery_at,
            }
          : undefined
      })(),
    })),
  })
}

// POST /api/webhooks/endpoints
// { clinicId, name, url, events: string[], enabled?: boolean, secret?: string }
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => null)
  const clinicId = String(body?.clinicId || '')
  if (!clinicId || !(await checkClinicAccess(session.user.id, clinicId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const name = String(body?.name || '').trim()
  const url = String(body?.url || '').trim()
  const events = Array.isArray(body?.events) ? body.events.map((x: any) => String(x)) : []
  const enabled = body?.enabled === undefined ? true : Boolean(body.enabled)
  const secret = String(body?.secret || '') || generateSecret()
  const rawMax = Number.isFinite(Number(body?.maxConcurrentDeliveries)) ? Number(body.maxConcurrentDeliveries) : 5
  const maxConcurrentDeliveries = Math.max(1, Math.min(15, rawMax))
  const allowedCats = new Set(['all','products'])
  const categoryFilter = allowedCats.has(String(body?.categoryFilter)) ? String(body?.categoryFilter) : 'all'
  const statusFilters = Array.isArray(body?.statusFilters) ? body.statusFilters.map((x: any) => String(x)) : []
  const productFilters = Array.isArray(body?.productFilters) ? body.productFilters.map((x: any) => String(x)) : []

  if (!name || !url || !url.startsWith('https://') || !events.length) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const endpoint = await prisma.webhookEndpoint.create({
    data: { clinicId, name, url, events, enabled, secret, maxConcurrentDeliveries, categoryFilter, statusFilters, productFilters },
  })

  return NextResponse.json(endpoint)
}
