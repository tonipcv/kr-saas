import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkClinicAccess } from '@/lib/auth/check-clinic-access'

// GET /api/webhooks/endpoints/[id]
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const hasModel = (prisma as any)?.webhookEndpoint && typeof (prisma as any).webhookEndpoint.findUnique === 'function'
  const endpoint = hasModel
    ? await (prisma as any).webhookEndpoint.findUnique({ where: { id: params.id } })
    : await prisma.$queryRawUnsafe<any[]>(
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
          WHERE id = $1
          LIMIT 1`,
        params.id
      ).then(rows => rows?.[0] || null).catch(() => null)
  if (!endpoint) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await checkClinicAccess(session.user.id, endpoint.clinicId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return NextResponse.json(endpoint)
}

// PATCH /api/webhooks/endpoints/[id]
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const hasModel = (prisma as any)?.webhookEndpoint && typeof (prisma as any).webhookEndpoint.findUnique === 'function'
  const existing = hasModel
    ? await (prisma as any).webhookEndpoint.findUnique({ where: { id: params.id } })
    : await prisma.$queryRawUnsafe<any[]>(
        `SELECT id,
                clinic_id as "clinicId",
                name,
                url,
                events,
                enabled,
                max_concurrent_deliveries as "maxConcurrentDeliveries",
                category_filter as "categoryFilter",
                status_filters as "statusFilters",
                product_filters as "productFilters"
           FROM webhook_endpoints WHERE id = $1 LIMIT 1`,
        params.id
      ).then(rows => rows?.[0] || null).catch(() => null)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await checkClinicAccess(session.user.id, existing.clinicId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json().catch(() => ({}))
  const name = body.name === undefined ? existing.name : String(body.name)
  const url = body.url === undefined ? existing.url : String(body.url)
  const events = Array.isArray(body.events) ? body.events.map((x: any) => String(x)) : existing.events
  const enabled = body.enabled === undefined ? existing.enabled : Boolean(body.enabled)
  const rawMax = Number.isFinite(Number(body?.maxConcurrentDeliveries)) ? Number(body.maxConcurrentDeliveries) : existing.maxConcurrentDeliveries ?? 5
  const maxConcurrentDeliveries = Math.max(1, Math.min(15, rawMax))
  const allowedCats = new Set(['all','products'])
  const categoryFilter = body.categoryFilter === undefined ? (existing.categoryFilter ?? 'all') : (allowedCats.has(String(body.categoryFilter)) ? String(body.categoryFilter) : 'all')
  const statusFilters = Array.isArray(body?.statusFilters) ? body.statusFilters.map((x: any) => String(x)) : (existing.statusFilters ?? [])
  const productFilters = Array.isArray(body?.productFilters) ? body.productFilters.map((x: any) => String(x)) : (existing.productFilters ?? [])
  if (!name || !url || !url.startsWith('https://') || !events.length) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }
  const endpoint = hasModel
    ? await (prisma as any).webhookEndpoint.update({ where: { id: params.id }, data: { name, url, events, enabled, maxConcurrentDeliveries, categoryFilter, statusFilters, productFilters } })
    : await (async () => {
        await prisma.$executeRawUnsafe(
          `UPDATE webhook_endpoints
              SET name = $1,
                  url = $2,
                  events = $3::text[],
                  enabled = $4,
                  max_concurrent_deliveries = $5,
                  category_filter = $6,
                  status_filters = $7::text[],
                  product_filters = $8::text[],
                  updated_at = NOW()
            WHERE id = $9`,
          name, url, events, enabled, maxConcurrentDeliveries, categoryFilter, statusFilters, productFilters, params.id
        )
        const rows = await prisma.$queryRawUnsafe<any[]>(
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
             FROM webhook_endpoints WHERE id = $1 LIMIT 1`,
          params.id
        ).catch(() => [])
        return rows?.[0] || null
      })()
  return NextResponse.json(endpoint)
}

// DELETE /api/webhooks/endpoints/[id]
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const hasModel = (prisma as any)?.webhookEndpoint && typeof (prisma as any).webhookEndpoint.findUnique === 'function'
  const existing = hasModel
    ? await (prisma as any).webhookEndpoint.findUnique({ where: { id: params.id } })
    : await prisma.$queryRawUnsafe<any[]>(
        `SELECT id, clinic_id as "clinicId" FROM webhook_endpoints WHERE id = $1 LIMIT 1`,
        params.id
      ).then(rows => rows?.[0] || null).catch(() => null)
  if (!existing) return NextResponse.json({ ok: true })
  if (!(await checkClinicAccess(session.user.id, existing.clinicId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (hasModel) {
    await (prisma as any).webhookEndpoint.delete({ where: { id: params.id } })
  } else {
    await prisma.$executeRawUnsafe(`DELETE FROM webhook_endpoints WHERE id = $1`, params.id)
  }
  return NextResponse.json({ ok: true })
}
