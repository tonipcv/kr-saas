import React from 'react';
import { prisma } from '@/lib/prisma';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ClientActions from '@/components/business/ClientActions';

type PageProps = { params: Promise<{ id: string }> };

export default async function BusinessClientPage({ params }: PageProps) {
  const { id: customerId } = await params;

  // Load Business Customer (unified model), not legacy user/patient
  const customerRows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, name, email, phone, document, created_at as "createdAt", updated_at as "updatedAt"
       FROM customers
      WHERE id = $1
      LIMIT 1`,
    String(customerId)
  );
  const customer = customerRows?.[0] || null;

  // Related data by customer_id
  const [providers, paymentMethods, subscriptions, transactions] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(
      `SELECT provider, account_id as "accountId", provider_customer_id as "providerCustomerId", created_at as "createdAt"
         FROM customer_providers
        WHERE customer_id = $1
        ORDER BY provider ASC, created_at DESC
        LIMIT 100`,
      String(customerId)
    ),
    prisma.$queryRawUnsafe<any[]>(
      `SELECT id, provider, account_id as "accountId", brand, last4, exp_month as "expMonth", exp_year as "expYear", status, is_default as "isDefault", created_at as "createdAt"
         FROM customer_payment_methods
        WHERE customer_id = $1
        ORDER BY is_default DESC, created_at DESC
        LIMIT 100`,
      String(customerId)
    ),
    prisma.$queryRawUnsafe<any[]>(
      `SELECT id, provider, account_id as "accountId", status, price_cents as "priceCents", currency,
              start_at as "startAt", trial_ends_at as "trialEndsAt", current_period_start as "currentPeriodStart",
              current_period_end as "currentPeriodEnd", provider_subscription_id as "providerSubscriptionId",
              metadata, updated_at as "updatedAt"
         FROM customer_subscriptions
        WHERE customer_id = $1
        ORDER BY updated_at DESC
        LIMIT 200`,
      String(customerId)
    ),
    prisma.$queryRawUnsafe<any[]>(
      `SELECT id, provider, provider_order_id as "providerOrderId", provider_charge_id as "providerChargeId",
              status, status_v2 as "statusV2", amount_cents as "amountCents", currency,
              payment_method_type as "paymentMethodType", installments, product_id as "productId",
              created_at as "createdAt", updated_at as "updatedAt"
         FROM payment_transactions
        WHERE customer_id = $1
        ORDER BY created_at DESC
        LIMIT 200`,
      String(customerId)
    ),
  ]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
          {/* Header */}
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-[20px] font-semibold text-gray-900 tracking-[-0.01em]">Customer</h1>
                <p className="text-sm text-gray-500 mt-1">Unified customer details</p>
                {customer && (
                  <div className="mt-2 text-sm text-gray-700">
                    <div className="font-medium">{customer.name || customer.email || customer.id}</div>
                    <div className="text-gray-500">{customer.email || customer.document}</div>
                  </div>
                )}
              </div>
              {/* Optional: keep actions hidden or adapt for customers */}
              <div />
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-3">
            <Tabs defaultValue="providers">
              <TabsList className="mb-3">
                <TabsTrigger value="providers">Providers</TabsTrigger>
                <TabsTrigger value="methods">Payment Methods</TabsTrigger>
                <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
                <TabsTrigger value="charges">Charges</TabsTrigger>
              </TabsList>

              {/* Providers */}
              <TabsContent value="providers">
                <div className="overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50/80 text-xs text-gray-600">
                      <tr>
                        <th className="px-2 py-2 text-left">Provider</th>
                        <th className="px-2 py-2 text-left">Account</th>
                        <th className="px-2 py-2 text-left">Provider Customer</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {providers.map((p) => (
                        <tr key={`${p.provider}-${p.accountId}-${p.providerCustomerId}`} className="hover:bg-gray-50">
                          <td className="px-2 py-2">{p.provider}</td>
                          <td className="px-2 py-2">{p.accountId || '-'}</td>
                          <td className="px-2 py-2">{p.providerCustomerId || '-'}</td>
                        </tr>
                      ))}
                      {providers.length === 0 && (
                        <tr><td className="px-3 py-6 text-gray-500" colSpan={3}>No providers.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              {/* Payment Methods */}
              <TabsContent value="methods">
                <div className="overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50/80 text-xs text-gray-600">
                      <tr>
                        <th className="px-2 py-2 text-left">Created</th>
                        <th className="px-2 py-2 text-left">Brand</th>
                        <th className="px-2 py-2 text-left">Last4</th>
                        <th className="px-2 py-2 text-left">Exp</th>
                        <th className="px-2 py-2 text-left">Status</th>
                        <th className="px-2 py-2 text-left">Provider</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {paymentMethods.map((m) => (
                        <tr key={m.id} className="hover:bg-gray-50">
                          <td className="px-2 py-2 text-gray-500 whitespace-nowrap">{formatDate(m.createdAt)}</td>
                          <td className="px-2 py-2">{m.brand || '-'}</td>
                          <td className="px-2 py-2">{m.last4 || '-'}</td>
                          <td className="px-2 py-2">{m.expMonth ? `${m.expMonth}/${String(m.expYear || '').toString().slice(-2)}` : '-'}</td>
                          <td className="px-2 py-2">{m.status || '-'}</td>
                          <td className="px-2 py-2">{m.provider}</td>
                        </tr>
                      ))}
                      {paymentMethods.length === 0 && (
                        <tr><td className="px-3 py-6 text-gray-500" colSpan={6}>No payment methods.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              {/* Subscriptions */}
              <TabsContent value="subscriptions">
                <div className="overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50/80 text-xs text-gray-600">
                      <tr>
                        <th className="px-2 py-2 text-left">Provider</th>
                        <th className="px-2 py-2 text-left">Status</th>
                        <th className="px-2 py-2 text-left">Current Period</th>
                        <th className="px-2 py-2 text-left">Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {subscriptions.map((s) => (
                        <tr key={s.id} className="hover:bg-gray-50">
                          <td className="px-2 py-2">{s.provider}</td>
                          <td className="px-2 py-2">{s.status}</td>
                          <td className="px-2 py-2">{s.currentPeriodStart ? `${formatDate(s.currentPeriodStart)} - ${s.currentPeriodEnd ? formatDate(s.currentPeriodEnd) : ''}` : '-'}</td>
                          <td className="px-2 py-2">{typeof s.priceCents === 'number' ? (s.priceCents/100).toLocaleString(undefined, { style: 'currency', currency: s.currency || 'BRL' }) : '-'}</td>
                        </tr>
                      ))}
                      {subscriptions.length === 0 && (
                        <tr><td className="px-3 py-6 text-gray-500" colSpan={4}>No subscriptions.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              {/* Charges */}
              <TabsContent value="charges">
                <div className="overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50/80 text-xs text-gray-600">
                      <tr>
                        <th className="px-2 py-2 text-left">Provider</th>
                        <th className="px-2 py-2 text-left">Order Id</th>
                        <th className="px-2 py-2 text-left">Status</th>
                        <th className="px-2 py-2 text-right">Amount</th>
                        <th className="px-2 py-2 text-left">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {transactions.map((t) => (
                        <tr key={t.id} className="hover:bg-gray-50">
                          <td className="px-2 py-2">{t.provider}</td>
                          <td className="px-2 py-2">{t.providerOrderId || '-'}</td>
                          <td className="px-2 py-2">{t.status}</td>
                          <td className="px-2 py-2 text-right">{typeof t.amountCents === 'number' ? (t.amountCents/100).toLocaleString(undefined, { style: 'currency', currency: t.currency || 'BRL' }) : '-'}</td>
                          <td className="px-2 py-2">{t.createdAt ? formatDate(t.createdAt) : '-'}</td>
                        </tr>
                      ))}
                      {transactions.length === 0 && (
                        <tr><td className="px-3 py-6 text-gray-500" colSpan={5}>No charges.</td></tr>
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
