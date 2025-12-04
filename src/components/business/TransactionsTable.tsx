"use client";

import React, { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { labelForPaymentMethod } from "@/lib/payments/normalize";

type TxRow = {
  id: string;
  provider?: string | null;
  provider_order_id: string | null;
  provider_charge_id: string | null;
  doctor_id: string | null;
  doctor_name?: string | null;
  patient_profile_id: string | null;
  patient_name?: string | null;
  patient_email?: string | null;
  clinic_id: string | null;
  clinic_name?: string | null;
  product_id: string | null;
  product_name?: string | null;
  amount_cents: number | null;
  clinic_amount_cents?: number | null;
  platform_amount_cents?: number | null;
  refunded_cents?: number | null;
  currency: string | null;
  installments: number | null;
  payment_method_type: string | null;
  status: string | null;
  created_at: string | Date | null;
  raw_payload?: any;
  client_name?: string | null;
  client_email?: string | null;
};

function formatAmount(amountCents?: number | string | null, currency?: string | null) {
  if (amountCents == null) return "-";
  const cents = typeof amountCents === 'number' ? amountCents : Number(amountCents);
  const value = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(value);
  } catch {
    return `${value} ${currency || ''}`.trim();
  }
}

function formatDate(v: any) {
  try {
    const d = new Date(v);
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  } catch {
    return String(v ?? '');
  }
}

export default function TransactionsTable({ transactions }: { transactions: TxRow[] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<TxRow | null>(null);
  const [showPayload, setShowPayload] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);

  const onRowDoubleClick = (t: TxRow) => {
    setSelected(t);
    setOpen(true);
  };

  const methodBadge = (method?: string | null, installments?: number | null) => {
    const base = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border bg-gray-100 text-gray-800 border-gray-300';
    const label = labelForPaymentMethod(method || null);
    
    // Special handling for card with installments
    if (label === 'Cartão') {
      return (
        <span className={base}>
          <span>{label}</span>
          {Number(installments) > 1 ? <span className="opacity-70">({installments}x)</span> : null}
        </span>
      );
    }
    
    return <span className={base}>{label}</span>;
  };

  const canRefund = useMemo(() => {
    const s = String(selected?.status || '').toUpperCase();
    return s === 'PAID' && !!selected?.provider_charge_id;
  }, [selected]);

  const onRefund = async () => {
    if (!selected?.provider_charge_id) return;
    // Confirmation dialog
    const confirmed = window.confirm(
      'Confirmar estorno desta cobrança?\n\n' +
      `Order: ${selected.provider_order_id || 'N/A'}\n` +
      `Charge: ${selected.provider_charge_id}\n` +
      `Valor: ${formatAmount(selected.amount_cents as any, selected.currency)}\n\n` +
      'Esta ação não pode ser desfeita.'
    );
    if (!confirmed) return;

    setRefunding(true);
    setRefundError(null);
    try {
      const res = await fetch('/api/payments/pagarme/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chargeId: selected.provider_charge_id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Falha ao solicitar estorno');
      // Sucesso: fechar modal e recarregar para ver webhooks aplicarem o status
      setOpen(false);
      try { window.location.reload(); } catch {}
    } catch (e: any) {
      setRefundError(e?.message || 'Falha ao solicitar estorno');
    } finally {
      setRefunding(false);
    }
  };

  const badgeFor = (statusValue?: string | null) => {
    const status = String(statusValue || '').toUpperCase();
    const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium';
    switch (status) {
      case 'PAID':
        return <span className={`${base} bg-green-100 text-green-800 border border-green-200`}>Paid</span>;
      case 'PROCESSING':
        return <span className={`${base} bg-amber-100 text-amber-800 border border-amber-200`}>Processing</span>;
      case 'PENDING':
        return <span className={`${base} bg-amber-100 text-amber-800 border border-amber-200`}>Pending</span>;
      case 'ACTIVE':
        return <span className={`${base} bg-amber-100 text-amber-800 border border-amber-200`}>Pending</span>;
      case 'FAILED':
      case 'REFUSED':
        return <span className={`${base} bg-red-100 text-red-800 border border-red-200`}>Failed</span>;
      case 'CANCELED':
      case 'CANCELLED':
        return <span className={`${base} bg-red-100 text-red-800 border border-red-200`}>Canceled</span>;
      case 'REFUNDED':
        // Show interim "Refund" until provider completes cancel flow (webhook will later set Canceled)
        return <span className={`${base} bg-gray-100 text-gray-800 border border-gray-300`}>Refund</span>;
      default:
        return status ? <span className={`${base} bg-gray-100 text-gray-700 border border-gray-200`}>{status}</span>
                       : <span className={`${base} bg-gray-100 text-gray-500 border border-gray-200`}>—</span>;
    }
  };

  const payloadPretty = useMemo(() => {
    if (!selected?.raw_payload) return null;
    try { return JSON.stringify(selected.raw_payload, null, 2); } catch { return String(selected.raw_payload); }
  }, [selected]);

  const statusPt = (statusValue?: string | null) => {
    const s = String(statusValue || '').toUpperCase();
    switch (s) {
      case 'PAID': return 'Pago';
      case 'PENDING': return 'Aguardando pagamento';
      case 'PROCESSING': return 'Processando';
      case 'CANCELED':
      case 'CANCELLED': return 'Canceled';
      case 'REFUNDED': return 'Refund';
      case 'FAILED':
      case 'REFUSED': return 'Falhou';
      default: return s || '—';
    }
  };

  return (
    <>
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50/80 text-xs text-gray-600">
            <tr>
              <th className="px-2 py-2 text-left">Client</th>
              <th className="px-2 py-2 text-left">Email</th>
              <th className="px-2 py-2 text-left">Business</th>
              <th className="px-2 py-2 text-left">Staff</th>
              <th className="px-2 py-2 text-left">Product</th>
              <th className="px-2 py-2 text-left">Gateway</th>
              <th className="px-2 py-2 text-right">Amount</th>
              <th className="px-2 py-2 text-left">Curr</th>
              <th className="px-2 py-2 text-left">Installments</th>
              <th className="px-2 py-2 text-left">Method</th>
              <th className="px-2 py-2 text-left">Status</th>
              <th className="px-2 py-2 text-left">Created</th>
              <th className="px-2 py-2 text-left">ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {transactions.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50 cursor-zoom-in" onDoubleClick={() => onRowDoubleClick(t)}>
                <td className="px-2 py-2 whitespace-nowrap max-w-[160px] truncate">{t.client_name || t.patient_name || t.patient_profile_id}</td>
                <td className="px-2 py-2 whitespace-nowrap max-w-[180px] truncate">{t.client_email || t.patient_email || ''}</td>
                <td className="px-2 py-2 whitespace-nowrap max-w-[160px] truncate">{t.clinic_name || t.clinic_id}</td>
                <td className="px-2 py-2 whitespace-nowrap max-w-[160px] truncate">{t.doctor_name || t.doctor_id}</td>
                <td className="px-2 py-2 whitespace-nowrap max-w-[160px] truncate">{t.product_name || t.product_id}</td>
                <td className="px-2 py-2 whitespace-nowrap">
                  {(() => {
                    const p = String(t.provider || '').toLowerCase();
                    const name = p === 'pagarme' ? 'KRXPAY' : (p ? p.toUpperCase() : '—');
                    const cls = 'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border';
                    return <span className={`${cls} bg-gray-100 text-gray-800 border-gray-300`}>{name}</span>;
                  })()}
                </td>
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  <div className="flex flex-col items-end leading-tight">
                    <div className="font-medium">{formatAmount((t.clinic_amount_cents ?? t.amount_cents) as any, t.currency)}</div>
                    {typeof t.clinic_amount_cents === 'number' && t.amount_cents != null && t.clinic_amount_cents !== t.amount_cents && (
                      <div className="text-[11px] text-gray-500">Bruto: {formatAmount(t.amount_cents as any, t.currency)}</div>
                    )}
                  </div>
                </td>
                <td className="px-2 py-2 whitespace-nowrap">{t.currency}</td>
                <td className="px-2 py-2 whitespace-nowrap">{t.installments}</td>
                <td className="px-2 py-2 whitespace-nowrap">{methodBadge(t.payment_method_type, t.installments as any)}</td>
                <td className="px-2 py-2 whitespace-nowrap">{badgeFor(t.status)}</td>
                <td className="px-2 py-2 text-gray-500 whitespace-nowrap">{formatDate(t.created_at)}</td>
                <td className="px-2 py-2 whitespace-nowrap">{t.id}</td>
              </tr>
            ))}
            {transactions.length === 0 && (
              <tr><td className="px-3 py-6 text-gray-500" colSpan={14}>No rows.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setShowPayload(false); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-white border border-gray-200 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-[18px] font-semibold text-gray-900">Transaction details</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-gray-500">Order:</span> {selected.provider_order_id || '—'}</div>
                <div><span className="text-gray-500">Charge:</span> {selected.provider_charge_id || '—'}</div>
                <div><span className="text-gray-500">Gateway:</span> {(() => { const p = String(selected?.provider || '').toLowerCase(); return p === 'pagarme' ? 'KRXPAY' : (p ? p.toUpperCase() : '—'); })()}</div>
                <div><span className="text-gray-500">Método:</span> {labelForPaymentMethod(selected.payment_method_type)}</div>
                <div className="flex items-center gap-2"><span className="text-gray-500">Status:</span> {badgeFor(selected.status)}</div>
                <div className="col-span-2 grid grid-cols-2 gap-2">
                  <div><span className="text-gray-500">Valor (bruto):</span> {formatAmount(selected.amount_cents as any, selected.currency)}</div>
                  <div>
                    <span className="text-gray-500">Valor (clínica):</span>{' '}
                    {(() => {
                      const hasClinic = typeof selected.clinic_amount_cents === 'number';
                      const hasPlatform = typeof selected.platform_amount_cents === 'number';
                      const hasAmount = typeof selected.amount_cents === 'number';
                      const fallback = hasAmount && hasPlatform
                        ? (selected.amount_cents as number) - (selected.platform_amount_cents as number)
                        : undefined;
                      const value = hasClinic
                        ? (selected.clinic_amount_cents as number)
                        : (typeof fallback === 'number' ? fallback : undefined);
                      return typeof value === 'number'
                        ? formatAmount(value as any, selected.currency)
                        : '—';
                    })()}
                  </div>
                </div>
                <div><span className="text-gray-500">Parcelas:</span> {selected.installments || '—'}</div>
                <div><span className="text-gray-500">Cliente:</span> {selected.client_name || selected.patient_name || selected.patient_profile_id || '—'}</div>
                <div><span className="text-gray-500">Email:</span> {selected.client_email || selected.patient_email || '—'}</div>
                <div><span className="text-gray-500">Business:</span> {selected.clinic_name || selected.clinic_id || '—'}</div>
                <div><span className="text-gray-500">Staff:</span> {selected.doctor_name || selected.doctor_id || '—'}</div>
                <div><span className="text-gray-500">Criado em:</span> {formatDate(selected.created_at)}</div>
                <div><span className="text-gray-500">Tx ID:</span> {selected.id}</div>
              </div>
              {canRefund && (
                <div className="mt-3 flex items-center justify-end gap-2">
                  {refundError && <div className="text-xs text-red-600 mr-auto">{refundError}</div>}
                  <button
                    type="button"
                    onClick={onRefund}
                    disabled={refunding}
                    className={`h-8 px-3 rounded-md text-white ${refunding ? 'bg-gray-400' : 'bg-black hover:bg-gray-900'}`}
                  >{refunding ? 'Estornando...' : 'Estornar'}</button>
                </div>
              )}
              {payloadPretty && (
                <div className="mt-2">
                  <div className="flex items-center justify-between">
                    <div className="text-gray-700 font-medium">Raw payload</div>
                    <button
                      type="button"
                      onClick={() => setShowPayload((v) => !v)}
                      className="text-xs text-blue-600 hover:underline"
                    >{showPayload ? 'Ocultar' : 'Mostrar'}</button>
                  </div>
                  {showPayload && (
                    <pre className="mt-2 text-xs bg-gray-50 border border-gray-200 rounded-lg p-2 overflow-auto max-h-[55vh]">{payloadPretty}</pre>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
