import React from 'react';
import TransactionsTable from '@/components/business/TransactionsTable';
import CheckoutSessionsTable from '@/components/business/CheckoutSessionsTable';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// Server component: lists latest records from payment_* tables

export default async function PaymentsDataPage({ searchParams }: { searchParams?: Promise<{ [k: string]: string | string[] | undefined }> }) {
  // Determine current clinic for the logged-in user
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="lg:ml-64"><div className="p-4 pt-[88px]">Unauthorized</div></div>
      </div>
    );
  }

  const clinicRow = await prisma.$queryRawUnsafe<any[]>(
    `WITH user_clinics AS (
        SELECT c.*,
               CASE WHEN c."ownerId" = $1 THEN 1 ELSE 0 END as is_owner
        FROM clinics c
        WHERE c."isActive" = true
          AND (
            c."ownerId" = $1 OR EXISTS (
              SELECT 1 FROM clinic_members cm
              WHERE cm."clinicId" = c.id AND cm."userId" = $1 AND cm."isActive" = true
            )
          )
      ), latest_sub AS (
        SELECT cs.*,
               ROW_NUMBER() OVER (PARTITION BY cs.clinic_id ORDER BY cs.created_at DESC) AS rn
        FROM clinic_subscriptions cs
      ), ranked AS (
        SELECT 
          uc.id,
          uc.name,
          uc.slug,
          ls.status::text as status,
          cp.monthly_price,
          CASE 
            WHEN ls.status = 'ACTIVE' AND cp.monthly_price IS NOT NULL AND cp.monthly_price > 0 THEN 3
            WHEN ls.status = 'ACTIVE' THEN 2
            WHEN ls.status = 'TRIAL' THEN 1
            ELSE 0
          END AS priority,
          uc.is_owner,
          uc."createdAt" as clinic_created_at,
          ls.created_at as sub_created_at
        FROM user_clinics uc
        LEFT JOIN latest_sub ls ON ls.clinic_id = uc.id AND ls.rn = 1
        LEFT JOIN clinic_plans cp ON cp.id = ls.plan_id
      )
      SELECT id, name, slug
      FROM ranked
      ORDER BY priority DESC, is_owner DESC, COALESCE(sub_created_at, clinic_created_at) DESC
      LIMIT 1`,
    session.user.id as any
  );
  const currentClinicId = clinicRow?.[0]?.id as string | undefined;
  if (!currentClinicId) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="lg:ml-64"><div className="p-4 pt-[88px]">Nenhuma clínica selecionada.</div></div>
      </div>
    );
  }

  // Fetch data server-side filtered by current clinic using a single connection
  const [customers, methods, transactions] = await prisma.$transaction([
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
        WHERE pc.clinic_id = $1
        ORDER BY pc.created_at DESC
        LIMIT 50`,
      currentClinicId
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
        WHERE pc.clinic_id = $1
        ORDER BY pm.created_at DESC
        LIMIT 50`,
      currentClinicId
    ),
    prisma.$queryRawUnsafe<any[]>(
      `SELECT pt.id,
              pt.provider,
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
              pt.clinic_amount_cents,
              pt.platform_amount_cents,
              pt.refunded_cents,
              pt.currency,
              pt.installments,
              pt.payment_method_type,
              pt.status,
              pt.created_at,
              pt.raw_payload,
              pt.client_name,
              pt.client_email
         FROM payment_transactions pt
    LEFT JOIN "User" d ON d.id = pt.doctor_id
    LEFT JOIN patient_profiles pp ON pp.id = pt.patient_profile_id
    LEFT JOIN "User" pu ON pu.id = pp.user_id
    LEFT JOIN clinics c ON c.id = pt.clinic_id
    LEFT JOIN products p ON p.id = pt.product_id
        WHERE pt.clinic_id = $1
        ORDER BY pt.updated_at DESC NULLS LAST, pt.created_at DESC
        LIMIT 50`,
      currentClinicId
    )
  ]);

  // Checkout Sessions: filters (await Next.js dynamic searchParams)
  const sp = (searchParams ? await searchParams : {}) as { [k: string]: string | string[] | undefined };
  const qClinic = ((typeof sp?.clinic === 'string' ? sp?.clinic : Array.isArray(sp?.clinic) ? sp?.clinic?.[0] : '')?.trim() || currentClinicId);
  const qStatus = (typeof sp?.status === 'string' ? sp?.status : Array.isArray(sp?.status) ? sp?.status?.[0] : '')?.trim() || '';
  const qFrom = (typeof sp?.from === 'string' ? sp?.from : Array.isArray(sp?.from) ? sp?.from?.[0] : '')?.trim() || '';
  const qTo = (typeof sp?.to === 'string' ? sp?.to : Array.isArray(sp?.to) ? sp?.to?.[0] : '')?.trim() || '';
  const qTabRaw = (typeof sp?.tab === 'string' ? sp.tab : Array.isArray(sp?.tab) ? sp.tab?.[0] : '')?.trim() || '';
  const allowedTabs = new Set(['transactions','customers','methods','sessions']);
  const currentTab = allowedTabs.has(qTabRaw) ? qTabRaw : 'transactions';

  const mkHref = (tab: string) => {
    const qs = new URLSearchParams();
    qs.set('tab', tab);
    if (qClinic) qs.set('clinic', qClinic);
    if (qStatus) qs.set('status', qStatus);
    if (qFrom) qs.set('from', qFrom);
    if (qTo) qs.set('to', qTo);
    return `/business/payments?${qs.toString()}`;
  };

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
            <Tabs defaultValue={currentTab}>
              <TabsList className="mb-3">
                <TabsTrigger value="transactions" asChild><Link href={mkHref('transactions')}>Transactions</Link></TabsTrigger>
                <TabsTrigger value="customers" asChild><Link href={mkHref('customers')}>Customers</Link></TabsTrigger>
                <TabsTrigger value="methods" asChild><Link href={mkHref('methods')}>Methods</Link></TabsTrigger>
                <TabsTrigger value="sessions" asChild><Link href={mkHref('sessions')}>Checkout Sessions</Link></TabsTrigger>
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
