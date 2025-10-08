import React from 'react';
import { prisma } from '@/lib/prisma';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ClientActions from '@/components/business/ClientActions';

type PageProps = { params: Promise<{ id: string }> };

export default async function BusinessClientPage({ params }: PageProps) {
  const { id: clientId } = await params;

  // Basic client info
  const user = await prisma.user.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, email: true, phone: true }
  });

  // Purchases from our purchases table
  const purchases = await prisma.purchase.findMany({
    where: { userId: clientId },
    orderBy: { createdAt: 'desc' },
    include: {
      product: { select: { id: true, name: true, price: true, creditsPerUnit: true } },
      doctor: { select: { id: true, name: true } }
    }
  });

  // Collect patient_profile ids for this user across doctors
  const profiles = await prisma.patientProfile.findMany({
    where: { userId: clientId },
    select: { id: true }
  });
  const profileIds = profiles.map(p => p.id);

  // Payments data (via raw tables)
  const [transactions, customers, methods] = await Promise.all([
    profileIds.length
      ? prisma.$queryRawUnsafe<any[]>(
          `SELECT pt.id,
                  pt.created_at,
                  pt.provider,
                  pt.provider_order_id,
                  pt.provider_charge_id,
                  pt.doctor_id,
                  d.name AS doctor_name,
                  pt.patient_profile_id,
                  pt.clinic_id,
                  c.name AS clinic_name,
                  pt.product_id,
                  pt.amount_cents,
                  pt.currency,
                  pt.installments,
                  pt.payment_method_type,
                  pt.status
             FROM payment_transactions pt
        LEFT JOIN "User" d ON d.id = pt.doctor_id
        LEFT JOIN clinics c ON c.id = pt.clinic_id
            WHERE pt.patient_profile_id = ANY($1)
            ORDER BY pt.created_at DESC
            LIMIT 100`,
          profileIds
        )
      : Promise.resolve([]),
    profileIds.length
      ? prisma.$queryRawUnsafe<any[]>(
          `SELECT pc.id,
                  pc.created_at,
                  pc.provider,
                  pc.provider_customer_id,
                  pc.doctor_id,
                  d.name AS doctor_name,
                  pc.patient_profile_id,
                  pc.clinic_id,
                  c.name AS clinic_name
             FROM payment_customers pc
        LEFT JOIN "User" d ON d.id = pc.doctor_id
        LEFT JOIN clinics c ON c.id = pc.clinic_id
            WHERE pc.patient_profile_id = ANY($1)
            ORDER BY pc.created_at DESC
            LIMIT 50`,
          profileIds
        )
      : Promise.resolve([]),
    profileIds.length
      ? prisma.$queryRawUnsafe<any[]>(
          `SELECT pm.id,
                  pm.created_at,
                  pm.payment_customer_id,
                  pm.provider_card_id,
                  pm.brand,
                  pm.last4,
                  pm.exp_month,
                  pm.exp_year,
                  pm.is_default,
                  pm.status
             FROM payment_methods pm
            WHERE pm.payment_customer_id IN (
              SELECT id FROM payment_customers WHERE patient_profile_id = ANY($1)
            )
            ORDER BY pm.created_at DESC
            LIMIT 50`,
          profileIds
        )
      : Promise.resolve([]),
  ]);

  // Try to infer preferred clinic slug from existing data
  let defaultSlug: string | undefined = undefined;
  try {
    const clinicIdFromData = (transactions[0]?.clinic_id) || (customers[0]?.clinic_id) || null;
    if (clinicIdFromData) {
      const clinic = await prisma.clinic.findUnique({ where: { id: clinicIdFromData }, select: { slug: true, subdomain: true } });
      defaultSlug = clinic?.slug || clinic?.subdomain || undefined;
    }
  } catch {}

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
          {/* Header */}
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-[20px] font-semibold text-gray-900 tracking-[-0.01em]">Client</h1>
                <p className="text-sm text-gray-500 mt-1">Focus on transactions and purchased products</p>
                {user && (
                  <div className="mt-2 text-sm text-gray-700">
                    <div className="font-medium">{user.name || user.email}</div>
                    <div className="text-gray-500">{user.email}</div>
                  </div>
                )}
              </div>
              <ClientActions client={{ id: clientId, name: user?.name, email: user?.email, phone: user?.phone }} defaultSlug={defaultSlug} />
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-3">
            <Tabs defaultValue="purchases">
              <TabsList className="mb-3">
                <TabsTrigger value="purchases">Purchases</TabsTrigger>
                <TabsTrigger value="transactions">Transactions</TabsTrigger>
                <TabsTrigger value="methods">Methods</TabsTrigger>
                <TabsTrigger value="customers">Customers</TabsTrigger>
              </TabsList>

              {/* Purchases */}
              <TabsContent value="purchases">
                <div className="overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50/80 text-xs text-gray-600">
                      <tr>
                        <th className="px-2 py-2 text-left">Date</th>
                        <th className="px-2 py-2 text-left">Product</th>
                        <th className="px-2 py-2 text-right">Qty</th>
                        <th className="px-2 py-2 text-right">Unit</th>
                        <th className="px-2 py-2 text-right">Total</th>
                        <th className="px-2 py-2 text-right">Points</th>
                        <th className="px-2 py-2 text-left">Staff</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {purchases.map((p) => (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="px-2 py-2 text-gray-500 whitespace-nowrap">{formatDate(p.createdAt)}</td>
                          <td className="px-2 py-2">{p.product?.name || p.productId}</td>
                          <td className="px-2 py-2 text-right">{p.quantity}</td>
                          <td className="px-2 py-2 text-right">{formatMoney(p.unitPrice as any)}</td>
                          <td className="px-2 py-2 text-right">{formatMoney(p.totalPrice as any)}</td>
                          <td className="px-2 py-2 text-right">{toNumber(p.pointsAwarded)}</td>
                          <td className="px-2 py-2">{p.doctor?.name || '-'}</td>
                        </tr>
                      ))}
                      {purchases.length === 0 && (
                        <tr><td className="px-3 py-6 text-gray-500" colSpan={7}>No purchases.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              {/* Transactions */}
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
                        <th className="px-2 py-2 text-left">Business</th>
                        <th className="px-2 py-2 text-right">Amount</th>
                        <th className="px-2 py-2 text-left">Currency</th>
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
                          <td className="px-2 py-2">{t.clinic_name || t.clinic_id}</td>
                          <td className="px-2 py-2 text-right">{formatAmount(t.amount_cents, t.currency)}</td>
                          <td className="px-2 py-2">{t.currency}</td>
                          <td className="px-2 py-2">{t.payment_method_type}</td>
                          <td className="px-2 py-2">{t.status}</td>
                        </tr>
                      ))}
                      {transactions.length === 0 && (
                        <tr><td className="px-3 py-6 text-gray-500" colSpan={10}>No transactions.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              {/* Methods */}
              <TabsContent value="methods">
                <div className="overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50/80 text-xs text-gray-600">
                      <tr>
                        <th className="px-2 py-2 text-left">Created</th>
                        <th className="px-2 py-2 text-left">Payment Customer</th>
                        <th className="px-2 py-2 text-left">Card ID</th>
                        <th className="px-2 py-2 text-left">Brand</th>
                        <th className="px-2 py-2 text-left">Last4</th>
                        <th className="px-2 py-2 text-left">Exp</th>
                        <th className="px-2 py-2 text-left">Default</th>
                        <th className="px-2 py-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {methods.map((m) => (
                        <tr key={m.id} className="hover:bg-gray-50">
                          <td className="px-2 py-2 text-gray-500 whitespace-nowrap">{formatDate(m.created_at)}</td>
                          <td className="px-2 py-2">{m.payment_customer_id}</td>
                          <td className="px-2 py-2">{m.provider_card_id}</td>
                          <td className="px-2 py-2">{m.brand}</td>
                          <td className="px-2 py-2">{m.last4}</td>
                          <td className="px-2 py-2">{m.exp_month}/{m.exp_year}</td>
                          <td className="px-2 py-2">{m.is_default ? 'Yes' : 'No'}</td>
                          <td className="px-2 py-2">{m.status}</td>
                        </tr>
                      ))}
                      {methods.length === 0 && (
                        <tr><td className="px-3 py-6 text-gray-500" colSpan={8}>No payment methods.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              {/* Customers */}
              <TabsContent value="customers">
                <div className="overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50/80 text-xs text-gray-600">
                      <tr>
                        <th className="px-2 py-2 text-left">Created</th>
                        <th className="px-2 py-2 text-left">Provider</th>
                        <th className="px-2 py-2 text-left">Provider Cust</th>
                        <th className="px-2 py-2 text-left">Staff</th>
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
                          <td className="px-2 py-2">{c.clinic_name || c.clinic_id}</td>
                          <td className="px-2 py-2">{c.id}</td>
                        </tr>
                      ))}
                      {customers.length === 0 && (
                        <tr><td className="px-3 py-6 text-gray-500" colSpan={6}>No payment customers.</td></tr>
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

function formatMoney(val: any) {
  const num = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(num)) return '-';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'BRL' }).format(num);
}

function toNumber(val: any) {
  return typeof val === 'number' ? val : Number(val);
}

function formatAmount(amountCents?: number | string | null, currency?: string | null) {
  if (amountCents == null) return '-';
  const cents = typeof amountCents === 'number' ? amountCents : Number(amountCents);
  const value = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'BRL' }).format(value);
  } catch {
    return `${value} ${currency || ''}`.trim();
  }
}
