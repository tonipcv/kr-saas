import React from 'react';
import { prisma } from '@/lib/prisma';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Server component: lists latest records from payment_* tables
export default async function PaymentsDataPage() {
  // Fetch data server-side using raw SQL, since these tables are not in Prisma schema
  const [customers, methods, transactions] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(
      `SELECT pc.id,
              pc.provider,
              pc.provider_customer_id,
              pc.doctor_id,
              d.name AS doctor_name,
              pc.patient_profile_id,
              COALESCE(pp.name, pu.name) AS patient_name,
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
              pt.provider,
              pt.provider_order_id,
              pt.provider_charge_id,
              pt.doctor_id,
              d.name AS doctor_name,
              pt.patient_profile_id,
              COALESCE(pp.name, pu.name) AS patient_name,
              pt.clinic_id,
              c.name AS clinic_name,
              pt.product_id,
              pt.amount_cents,
              pt.currency,
              pt.installments,
              pt.payment_method_type,
              pt.status,
              pt.created_at
         FROM payment_transactions pt
    LEFT JOIN "User" d ON d.id = pt.doctor_id
    LEFT JOIN patient_profiles pp ON pp.id = pt.patient_profile_id
    LEFT JOIN "User" pu ON pu.id = pp.user_id
    LEFT JOIN clinics c ON c.id = pt.clinic_id
        ORDER BY pt.created_at DESC
        LIMIT 50`
    )
  ]);

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
              </TabsList>

              <TabsContent value="transactions">
                <div className="overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50/80 text-xs text-gray-600">
                      <tr>
                        <th className="px-2 py-2 text-left">Created</th>
                        <th className="px-2 py-2 text-left">Provider</th>
                        <th className="px-2 py-2 text-left">Order</th>
                        <th className="px-2 py-2 text-left">Charge</th>
                        <th className="px-2 py-2 text-left">Staff</th>
                        <th className="px-2 py-2 text-left">Client</th>
                        <th className="px-2 py-2 text-left">Business</th>
                        <th className="px-2 py-2 text-left">Product</th>
                        <th className="px-2 py-2 text-right">Amount</th>
                        <th className="px-2 py-2 text-left">Curr</th>
                        <th className="px-2 py-2 text-left">Installments</th>
                        <th className="px-2 py-2 text-left">Method</th>
                        <th className="px-2 py-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {transactions.map((t) => (
                        <tr key={t.id} className="hover:bg-gray-50">
                          <td className="px-2 py-2 text-gray-500 whitespace-nowrap">{formatDate(t.created_at)}</td>
                          <td className="px-2 py-2">{t.provider}</td>
                          <td className="px-2 py-2">{t.provider_order_id}</td>
                          <td className="px-2 py-2">{t.provider_charge_id}</td>
                          <td className="px-2 py-2">{t.doctor_name || t.doctor_id}</td>
                          <td className="px-2 py-2">{t.patient_name || t.patient_profile_id}</td>
                          <td className="px-2 py-2">{t.clinic_name || t.clinic_id}</td>
                          <td className="px-2 py-2">{t.product_id}</td>
                          <td className="px-2 py-2 text-right">{formatAmount(t.amount_cents, t.currency)}</td>
                          <td className="px-2 py-2">{t.currency}</td>
                          <td className="px-2 py-2">{t.installments}</td>
                          <td className="px-2 py-2">{t.payment_method_type}</td>
                          <td className="px-2 py-2">{t.status}</td>
                        </tr>
                      ))}
                      {transactions.length === 0 && (
                        <tr><td className="px-3 py-6 text-gray-500" colSpan={13}>No rows.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              <TabsContent value="customers">
                <div className="overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50/80 text-xs text-gray-600">
                      <tr>
                        <th className="px-2 py-2 text-left">Created</th>
                        <th className="px-2 py-2 text-left">Provider</th>
                        <th className="px-2 py-2 text-left">Provider Cust</th>
                        <th className="px-2 py-2 text-left">Staff</th>
                        <th className="px-2 py-2 text-left">Client</th>
                        <th className="px-2 py-2 text-left">Business</th>
                        <th className="px-2 py-2 text-left">ID</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {customers.map((c) => (
                        <tr key={c.id} className="hover:bg-gray-50">
                          <td className="px-2 py-2 text-gray-500 whitespace-nowrap">{formatDate(c.created_at)}</td>
                          <td className="px-2 py-2">{c.provider}</td>
                          <td className="px-2 py-2">{c.provider_customer_id}</td>
                          <td className="px-2 py-2">{c.doctor_name || c.doctor_id}</td>
                          <td className="px-2 py-2">{c.patient_name || c.patient_profile_id}</td>
                          <td className="px-2 py-2">{c.clinic_name || c.clinic_id}</td>
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
                      {methods.map((m) => (
                        <tr key={m.id} className="hover:bg-gray-50">
                          <td className="px-2 py-2 text-gray-500 whitespace-nowrap">{formatDate(m.created_at)}</td>
                          <td className="px-2 py-2">{m.payment_customer_id}</td>
                          <td className="px-2 py-2">{m.doctor_name || m.doctor_id}</td>
                          <td className="px-2 py-2">{m.patient_name || m.patient_profile_id}</td>
                          <td className="px-2 py-2">{m.clinic_name || m.clinic_id}</td>
                          <td className="px-2 py-2">{m.provider_card_id}</td>
                          <td className="px-2 py-2">{m.brand}</td>
                          <td className="px-2 py-2">{m.last4}</td>
                          <td className="px-2 py-2">{m.exp_month}/{m.exp_year}</td>
                          <td className="px-2 py-2">{m.is_default ? 'Yes' : 'No'}</td>
                          <td className="px-2 py-2">{m.status}</td>
                          <td className="px-2 py-2">{m.id}</td>
                        </tr>
                      ))}
                      {methods.length === 0 && (
                        <tr><td className="px-3 py-6 text-gray-500" colSpan={9}>No rows.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
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
