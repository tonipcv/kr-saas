import React from 'react';
import TransactionsTable from '@/components/business/TransactionsTable';
import CheckoutSessionsTable from '@/components/business/CheckoutSessionsTable';
import { prisma } from '@/lib/prisma';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Server component: lists latest records from payment_* tables

export default async function PaymentsDataPage({ searchParams }: { searchParams?: Promise<{ [k: string]: string | string[] | undefined }> }) {
  // Fetch data server-side using raw SQL, since these tables are not in Prisma schema
  const [customers, methods, transactions] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(
      `SELECT pc.id,
              pc.provider_customer_id,
              pc.doctor_id,
              d.name AS doctor_name,
              pc.patient_profile_id,
              COALESCE(pp.name, pu.name) AS patient_name,
              pu.email AS patient_email,
              pc.clinic_id,
              c.name AS clinic_name,
              pc.created_at
         FROM payment_customers pc
    LEFT JOIN "User" d ON d.id = pc.doctor_id
    LEFT JOIN patient_profiles pp ON pp.id = pc.patient_profile_id
    LEFT JOIN "User" pu ON pu.id = pp.user_id
    LEFT JOIN clinics c ON c.id = pc.clinic_id
        ORDER BY pc.created_at DESC
        LIMIT 50`
    ),
    prisma.$queryRawUnsafe<any[]>(
      `SELECT pm.id,
              pm.payment_customer_id,
              pm.provider_card_id,
              pm.brand,
              pm.last4,
              pm.exp_month,
              pm.exp_year,
              pm.is_default,
              pm.status,
              pm.created_at,
              pc.doctor_id,
              d.name AS doctor_name,
              pc.patient_profile_id,
              COALESCE(pp.name, pu.name) AS patient_name,
              pc.clinic_id,
              c.name AS clinic_name
         FROM payment_methods pm
    LEFT JOIN payment_customers pc ON pc.id = pm.payment_customer_id
    LEFT JOIN "User" d ON d.id = pc.doctor_id
    LEFT JOIN patient_profiles pp ON pp.id = pc.patient_profile_id
    LEFT JOIN "User" pu ON pu.id = pp.user_id
    LEFT JOIN clinics c ON c.id = pc.clinic_id
        ORDER BY pm.created_at DESC
        LIMIT 50`
    ),
    prisma.$queryRawUnsafe<any[]>(
      `SELECT pt.id,
              pt.provider_order_id,
              pt.provider_charge_id,
              pt.doctor_id,
              d.name AS doctor_name,
              pt.patient_profile_id,
              COALESCE(pp.name, pu.name) AS patient_name,
              pu.email AS patient_email,
              pt.clinic_id,
              c.name AS clinic_name,
              pt.product_id,
              p.name AS product_name,
              pt.amount_cents,
              pt.currency,
              pt.installments,
              pt.payment_method_type,
              pt.status,
              pt.created_at,
              pt.raw_payload
         FROM payment_transactions pt
    LEFT JOIN "User" d ON d.id = pt.doctor_id
    LEFT JOIN patient_profiles pp ON pp.id = pt.patient_profile_id
    LEFT JOIN "User" pu ON pu.id = pp.user_id
    LEFT JOIN clinics c ON c.id = pt.clinic_id
    LEFT JOIN products p ON p.id = pt.product_id
        ORDER BY pt.updated_at DESC NULLS LAST, pt.created_at DESC
        LIMIT 50`
    )
  ]);

  // Checkout Sessions: filters (await Next.js dynamic searchParams)
  const sp = (searchParams ? await searchParams : {}) as { [k: string]: string | string[] | undefined };
  const qClinic = (typeof sp?.clinic === 'string' ? sp?.clinic : Array.isArray(sp?.clinic) ? sp?.clinic?.[0] : '')?.trim() || '';
  const qStatus = (typeof sp?.status === 'string' ? sp?.status : Array.isArray(sp?.status) ? sp?.status?.[0] : '')?.trim() || '';
  const qFrom = (typeof sp?.from === 'string' ? sp?.from : Array.isArray(sp?.from) ? sp?.from?.[0] : '')?.trim() || '';
  const qTo = (typeof sp?.to === 'string' ? sp?.to : Array.isArray(sp?.to) ? sp?.to?.[0] : '')?.trim() || '';

  // Build WHERE dynamically and parameters list to avoid injection
  const whereParts: string[] = [];
  const params: any[] = [];
  if (qClinic) { whereParts.push(`clinic_id = $${params.length + 1}`); params.push(qClinic); }
  if (qStatus) { whereParts.push(`status = $${params.length + 1}`); params.push(qStatus); }
  if (qFrom) { whereParts.push(`started_at >= $${params.length + 1}`); params.push(new Date(qFrom)); }
  if (qTo) { whereParts.push(`started_at <= $${params.length + 1}`); params.push(new Date(qTo)); }
  const whereSql = whereParts.length ? ('WHERE ' + whereParts.join(' AND ')) : '';

  // Sessions list (limit 100 newest)
  const sessions = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, started_at, updated_at, status, email, phone,
            (CASE WHEN jsonb_typeof(metadata) IS NOT NULL THEN metadata->>'buyerName' ELSE NULL END) AS buyer_name,
            product_id, offer_id, pix_expires_at, order_id,
            utm_source, utm_medium, utm_campaign, utm_term, utm_content,
            origin, created_by, last_step, last_heartbeat_at, referrer
       FROM checkout_sessions
       ${whereSql}
    ORDER BY updated_at DESC NULLS LAST, started_at DESC
       LIMIT 100`,
    ...params
  ).catch(() => []);

  // KPIs
  async function kpiCount(where: string, ps: any[]) {
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS c FROM checkout_sessions ${where}`, ...ps).catch(() => [{ c: 0 }]);
    return Number(rows?.[0]?.c || 0);
  }
  const baseWhere = whereSql;
  const baseParams = params;
  const totalStarted = await kpiCount(baseWhere ? baseWhere + (baseWhere ? ' AND ' : ' WHERE ') + `status = 'started'` : `WHERE status = 'started'`, baseParams);
  const totalPix = await kpiCount(baseWhere ? baseWhere + (baseWhere ? ' AND ' : ' WHERE ') + `status = 'pix_generated'` : `WHERE status = 'pix_generated'`, baseParams);
  const totalPaid = await kpiCount(baseWhere ? baseWhere + (baseWhere ? ' AND ' : ' WHERE ') + `status = 'paid'` : `WHERE status = 'paid'`, baseParams);
  const totalAbandoned = await kpiCount(baseWhere ? baseWhere + (baseWhere ? ' AND ' : ' WHERE ') + `status = 'abandoned'` : `WHERE status = 'abandoned'`, baseParams);
  // Recovery (heurística mais rígida): considerar recuperadas apenas sessões que geraram PIX e foram pagas depois
  const totalRecoveredRows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*)::int AS c
       FROM checkout_sessions
       ${baseWhere}
       ${baseWhere ? ' AND ' : 'WHERE '} status = 'paid'
         AND (
           (pix_expires_at IS NOT NULL AND updated_at > pix_expires_at)
           OR EXISTS (
             SELECT 1 FROM checkout_sessions cs2
              WHERE cs2.id = checkout_sessions.id AND cs2.status = 'abandoned'
           )
         )`,
    ...baseParams
  ).catch(() => [{ c: 0 }]);
  const totalRecovered = Number(totalRecoveredRows?.[0]?.c || 0);
  const abandonmentRate = (() => {
    const denom = (totalPix + totalPaid + totalAbandoned) || 1; // ignora apenas 'started'
    return (totalAbandoned / denom) * 100;
  })();
  const recoveryRate = (() => {
    const denom = totalAbandoned || 1;
    return (totalRecovered / denom) * 100;
  })();
  // Sessions by utmSource (top 10)
  const byUtm = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COALESCE(utm_source, '—') AS source, COUNT(*)::int AS c
       FROM checkout_sessions ${whereSql}
      GROUP BY COALESCE(utm_source, '—')
      ORDER BY c DESC
      LIMIT 10`,
    ...params
  ).catch(() => []);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-[20px] font-semibold text-gray-900 tracking-[-0.01em]">Payments Data</h1>
                <p className="text-sm text-gray-500 mt-1">Latest rows from payment_customers, payment_methods and payment_transactions</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-3">
            <Tabs defaultValue="transactions">
              <TabsList className="mb-3">
                <TabsTrigger value="transactions">Transactions</TabsTrigger>
                <TabsTrigger value="customers">Customers</TabsTrigger>
                <TabsTrigger value="methods">Methods</TabsTrigger>
                <TabsTrigger value="sessions">Checkout Sessions</TabsTrigger>
              </TabsList>

              <TabsContent value="transactions">
                <TransactionsTable transactions={transactions as any} />
              </TabsContent>

              <TabsContent value="customers">
                <div className="overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50/80 text-xs text-gray-600">
                      <tr>
                        <th className="px-2 py-2 text-left">Client</th>
                        <th className="px-2 py-2 text-left">Email</th>
                        <th className="px-2 py-2 text-left">Business</th>
                        <th className="px-2 py-2 text-left">Staff</th>
                        <th className="px-2 py-2 text-left">Provider Cust</th>
                        <th className="px-2 py-2 text-left">Created</th>
                        <th className="px-2 py-2 text-left">ID</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {customers.map((c) => (
                        <tr key={c.id} className="hover:bg-gray-50">
                          <td className="px-2 py-2">{c.patient_name || c.patient_profile_id}</td>
                          <td className="px-2 py-2">{c.patient_email || ''}</td>
                          <td className="px-2 py-2">{c.clinic_name || c.clinic_id}</td>
                          <td className="px-2 py-2">{c.doctor_name || c.doctor_id}</td>
                          <td className="px-2 py-2">{c.provider_customer_id}</td>
                          <td className="px-2 py-2 text-gray-500 whitespace-nowrap">{formatDate(c.created_at)}</td>
                          <td className="px-2 py-2">{c.id}</td>
                        </tr>
                      ))}
                      {customers.length === 0 && (
                        <tr><td className="px-3 py-6 text-gray-500" colSpan={7}>No rows.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              <TabsContent value="methods">
                <div className="overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50/80 text-xs text-gray-600">
                      <tr>
                        <th className="px-2 py-2 text-left">Created</th>
                        <th className="px-2 py-2 text-left">Customer</th>
                        <th className="px-2 py-2 text-left">Staff</th>
                        <th className="px-2 py-2 text-left">Client</th>
                        <th className="px-2 py-2 text-left">Business</th>
                        <th className="px-2 py-2 text-left">Card ID</th>
                        <th className="px-2 py-2 text-left">Brand</th>
                        <th className="px-2 py-2 text-left">Last4</th>
                        <th className="px-2 py-2 text-left">Exp</th>
                        <th className="px-2 py-2 text-left">Default</th>
                        <th className="px-2 py-2 text-left">Status</th>
                        <th className="px-2 py-2 text-left">ID</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {methods.map((m) => {
                        const status = String(m.status || '').toUpperCase();
                        const badge = (() => {
                          const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium';
                          switch (status) {
                            case 'ACTIVE':
                              return <span className={`${base} bg-green-50 text-green-700 border border-green-200`}>Active</span>;
                            case 'INACTIVE':
                            case 'BLOCKED':
                              return <span className={`${base} bg-red-50 text-red-700 border border-red-200`}>Inactive</span>;
                            default:
                              return status ? <span className={`${base} bg-gray-100 text-gray-700 border border-gray-200`}>{status}</span>
                                             : <span className={`${base} bg-gray-100 text-gray-500 border border-gray-200`}>—</span>;
                          }
                        })();
                        return (
                          <tr key={m.id} className="hover:bg-gray-50">
                            <td className="px-2 py-2 text-gray-500 whitespace-nowrap">{formatDate(m.created_at)}</td>
                            <td className="px-2 py-2 whitespace-nowrap max-w-[160px] truncate">{m.payment_customer_id}</td>
                            <td className="px-2 py-2 whitespace-nowrap max-w-[160px] truncate">{m.doctor_name || m.doctor_id}</td>
                            <td className="px-2 py-2 whitespace-nowrap max-w-[160px] truncate">{m.patient_name || m.patient_profile_id}</td>
                            <td className="px-2 py-2 whitespace-nowrap max-w-[160px] truncate">{m.clinic_name || m.clinic_id}</td>
                            <td className="px-2 py-2 whitespace-nowrap">{m.provider_card_id}</td>
                            <td className="px-2 py-2 whitespace-nowrap">{m.brand}</td>
                            <td className="px-2 py-2 whitespace-nowrap">{m.last4}</td>
                            <td className="px-2 py-2 whitespace-nowrap">{m.exp_month}/{m.exp_year}</td>
                            <td className="px-2 py-2 whitespace-nowrap">{m.is_default ? 'Yes' : 'No'}</td>
                            <td className="px-2 py-2 whitespace-nowrap">{badge}</td>
                            <td className="px-2 py-2 whitespace-nowrap">{m.id}</td>
                          </tr>
                        );
                      })}
                      {methods.length === 0 && (
                        <tr><td className="px-3 py-6 text-gray-500" colSpan={9}>No rows.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              <TabsContent value="sessions">
                <div className="mb-3">
                  <form method="get" className="flex flex-wrap gap-2 items-center">
                    <input type="text" name="clinic" defaultValue={qClinic} className="h-8 px-2 rounded border text-sm placeholder:text-gray-400" placeholder="clinic_id" />
                    <select name="status" defaultValue={qStatus} className="h-8 px-2 rounded border text-sm">
                      <option value="">status</option>
                      <option value="started">started</option>
                      <option value="pix_generated">pix_generated</option>
                      <option value="paid">paid</option>
                      <option value="abandoned">abandoned</option>
                      <option value="canceled">canceled</option>
                    </select>
                    <input type="datetime-local" name="from" defaultValue={qFrom} className="h-8 px-2 rounded border text-sm" placeholder="from" />
                    <input type="datetime-local" name="to" defaultValue={qTo} className="h-8 px-2 rounded border text-sm" placeholder="to" />
                    <button type="submit" className="h-8 px-3 rounded border text-sm bg-white hover:bg-gray-50">Filtrar</button>
                  </form>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
                  <div className="rounded-md border p-3">
                    <div className="text-[11px] text-gray-500">Abandono</div>
                    <div className="text-xl font-semibold leading-6">{abandonmentRate.toFixed(1)}%</div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-[11px] text-gray-500">Recuperação</div>
                    <div className="text-xl font-semibold leading-6">{recoveryRate.toFixed(1)}%</div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-[11px] text-gray-500">Sessões (últimas 100)</div>
                    <div className="text-xl font-semibold leading-6">{sessions.length}</div>
                  </div>
                </div>

                <CheckoutSessionsTable sessions={sessions as any} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatDate(v: any) {
  try {
    const d = new Date(v);
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  } catch {
    return String(v ?? '');
  }
}

function formatAmount(amountCents?: number | string | null, currency?: string | null) {
  if (amountCents == null) return '-';
  const cents = typeof amountCents === 'number' ? amountCents : Number(amountCents);
  const value = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(value);
  } catch {
    return `${value} ${currency || ''}`.trim();
  }
}

function badgeClass(status: string) {
  const base = 'bg-gray-100 text-gray-700 border border-gray-200';
  switch (status) {
    case 'PAID': return 'bg-green-50 text-green-700 border border-green-200';
    case 'STARTED': return 'bg-blue-50 text-blue-700 border border-blue-200';
    case 'PIX_GENERATED': return 'bg-amber-50 text-amber-700 border border-amber-200';
    case 'ABANDONED': return 'bg-red-50 text-red-700 border border-red-200';
    case 'CANCELED': return 'bg-gray-200 text-gray-700 border border-gray-300';
    default: return base;
  }
}
