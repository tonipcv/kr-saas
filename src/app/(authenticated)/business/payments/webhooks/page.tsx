import React from 'react'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import WebhookEventsTable from '@/components/business/WebhookEventsTable'

export default async function WebhookEventsPage({ searchParams }: { searchParams?: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="lg:ml-64"><div className="p-4 pt-[88px]">Unauthorized</div></div>
      </div>
    )
  }

  const sp = (searchParams ? await searchParams : {}) as { [k: string]: string | string[] | undefined }
  const qProvider = (typeof sp.provider === 'string' ? sp.provider : Array.isArray(sp.provider) ? sp.provider[0] : '')?.trim() || ''
  const qType = (typeof sp.type === 'string' ? sp.type : Array.isArray(sp.type) ? sp.type[0] : '')?.trim() || ''
  const qProcessed = (typeof sp.processed === 'string' ? sp.processed : Array.isArray(sp.processed) ? sp.processed[0] : '')?.trim() || ''
  const qStatus = (typeof sp.status === 'string' ? sp.status : Array.isArray(sp.status) ? sp.status[0] : '')?.trim() || ''

  const whereParts: string[] = []
  const params: any[] = []
  if (qProvider) { whereParts.push(`provider = $${params.length + 1}`); params.push(qProvider) }
  if (qType) { whereParts.push(`type ILIKE $${params.length + 1}`); params.push(`%${qType}%`) }
  if (qProcessed) { whereParts.push(`processed = $${params.length + 1}`); params.push(qProcessed.toLowerCase() === 'true') }
  if (qStatus) { whereParts.push(`status = $${params.length + 1}`); params.push(qStatus) }
  const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : ''

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, provider, hook_id, provider_event_id, type, status,
            processed, retry_count, max_retries, next_retry_at, received_at, processed_at,
            processing_error, error_type, moved_dead_letter, dead_letter_reason,
            jsonb_path_query_first(raw, '$.data.object.id') as obj_id,
            raw
       FROM webhook_events
       ${whereSql}
   ORDER BY processed ASC, received_at DESC
      LIMIT 200`
    , ...params
  ).catch(() => [])

  const mkHref = (patch: Partial<Record<string,string>>) => {
    const qs = new URLSearchParams()
    if (qProvider) qs.set('provider', qProvider)
    if (qType) qs.set('type', qType)
    if (qProcessed) qs.set('processed', qProcessed)
    if (qStatus) qs.set('status', qStatus)
    Object.entries(patch).forEach(([k,v]) => {
      if (!v) qs.delete(k); else qs.set(k, v)
    })
    return `/business/payments/webhooks?${qs.toString()}`
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-[20px] font-semibold text-gray-900 tracking-[-0.01em]">Webhook Events</h1>
                <p className="text-sm text-gray-500 mt-1">List, filter, re-enqueue and inspect webhook deliveries</p>
              </div>
              <div className="flex gap-2">
                <Link href="/business/payments" className="inline-flex items-center px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50">Back to Payments</Link>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-3">
            {/* Filters */}
            <form action="/business/payments/webhooks" method="get" className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-3">
              <input name="provider" defaultValue={qProvider} placeholder="provider (e.g., stripe, pagarme)" className="px-2 py-2 border border-gray-200 rounded-lg text-sm" />
              <input name="type" defaultValue={qType} placeholder="type contains (e.g., order.paid)" className="px-2 py-2 border border-gray-200 rounded-lg text-sm" />
              <select name="processed" defaultValue={qProcessed} className="px-2 py-2 border border-gray-200 rounded-lg text-sm">
                <option value="">processed: any</option>
                <option value="true">processed: true</option>
                <option value="false">processed: false</option>
              </select>
              <input name="status" defaultValue={qStatus} placeholder="status (e.g., processing)" className="px-2 py-2 border border-gray-200 rounded-lg text-sm" />
              <div className="sm:col-span-4 flex gap-2">
                <button type="submit" className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm hover:bg-gray-50">Filter</button>
                <Link href="/business/payments/webhooks" className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm hover:bg-gray-50">Reset</Link>
              </div>
            </form>

            {/* Table with double-click modal */}
            <WebhookEventsTable rows={rows as any} />
          </div>
        </div>
      </div>
    </div>
  )
}

function fmtDate(v: any) {
  try { const d = new Date(v); return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(d) } catch { return String(v ?? '') }
}
