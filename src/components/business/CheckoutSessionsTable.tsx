"use client";

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

type SessionRow = {
  id: string;
  started_at: string | Date | null;
  status: string | null;
  buyer_name?: string | null;
  email?: string | null;
  phone?: string | null;
  product_id?: string | null;
  offer_id?: string | null;
  pix_expires_at?: string | Date | null;
  order_id?: string | null;
  origin?: string | null;
  created_by?: string | null;
  last_step?: string | null;
  last_heartbeat_at?: string | Date | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  referrer?: string | null;
};

function formatDate(v: any) {
  try {
    if (!v) return '—';
    const d = new Date(v);
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  } catch {
    return String(v ?? '');
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

export default function CheckoutSessionsTable({ sessions }: { sessions: SessionRow[] }) {
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<SessionRow | null>(null);

  const onRowDoubleClick = (s: SessionRow) => {
    setSelected(s);
    setOpen(true);
  };

  return (
    <div className="overflow-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50/80 text-xs text-gray-600">
          <tr>
            <th className="px-2 py-2 text-left">Started</th>
            <th className="px-2 py-2 text-left">Status</th>
            <th className="px-2 py-2 text-left">Name</th>
            <th className="px-2 py-2 text-left">Email</th>
            <th className="px-2 py-2 text-left">Phone</th>
            <th className="px-2 py-2 text-left">Product/Offer</th>
            <th className="px-2 py-2 text-left">PIX Expires</th>
            <th className="px-2 py-2 text-left">Order</th>
            <th className="px-2 py-2 text-left">Origin</th>
            <th className="px-2 py-2 text-left">CreatedBy</th>
            <th className="px-2 py-2 text-left">Last Step</th>
            <th className="px-2 py-2 text-left">Last Heartbeat</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sessions.map((s) => (
            <tr key={s.id} className="hover:bg-gray-50 cursor-pointer" onDoubleClick={() => onRowDoubleClick(s)}>
              <td className="px-2 py-2 text-gray-500 whitespace-nowrap">{formatDate(s.started_at)}</td>
              <td className="px-2 py-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${badgeClass(String(s.status || '').toUpperCase())}`}>{String(s.status || '').toUpperCase()}</span>
              </td>
              <td className="px-2 py-2 whitespace-nowrap max-w-[160px] truncate">{s.buyer_name || '—'}</td>
              <td className="px-2 py-2 whitespace-nowrap max-w-[180px] truncate">{s.email || '—'}</td>
              <td className="px-2 py-2 whitespace-nowrap max-w-[160px] truncate">{s.phone || '—'}</td>
              <td className="px-2 py-2 whitespace-nowrap max-w-[240px] truncate">{s.product_id || '—'}{s.offer_id ? ` / ${s.offer_id}` : ''}</td>
              <td className="px-2 py-2 text-gray-500 whitespace-nowrap">{formatDate(s.pix_expires_at)}</td>
              <td className="px-2 py-2 whitespace-nowrap max-w-[200px] truncate">{s.order_id || '—'}</td>
              <td className="px-2 py-2 whitespace-nowrap max-w-[120px] truncate">{s.origin || '—'}</td>
              <td className="px-2 py-2 whitespace-nowrap max-w-[120px] truncate">{s.created_by || '—'}</td>
              <td className="px-2 py-2 whitespace-nowrap max-w-[200px] truncate">{s.last_step || '—'}</td>
              <td className="px-2 py-2 text-gray-500 whitespace-nowrap">{formatDate(s.last_heartbeat_at)}</td>
            </tr>
          ))}
          {sessions.length === 0 && (
            <tr><td className="px-3 py-6 text-gray-500" colSpan={12}>No rows.</td></tr>
          )}
        </tbody>
      </table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Session details</DialogTitle>
            <DialogDescription className="truncate">ID: {selected?.id || '—'}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <Row label="Started" value={formatDate(selected?.started_at)} />
              <Row label="Status" value={String(selected?.status || '—').toUpperCase()} />
              <Row label="Name" value={selected?.buyer_name || '—'} />
              <Row label="Email" value={selected?.email || '—'} />
              <Row label="Phone" value={selected?.phone || '—'} />
              <Row label="Product" value={selected?.product_id || '—'} />
              <Row label="Offer" value={selected?.offer_id || '—'} />
              <Row label="Order" value={selected?.order_id || '—'} />
              <Row label="PIX Expires" value={formatDate(selected?.pix_expires_at)} />
            </div>
            <div className="space-y-1">
              <Row label="Origin" value={selected?.origin || '—'} />
              <Row label="CreatedBy" value={selected?.created_by || '—'} />
              <Row label="Last Step" value={selected?.last_step || '—'} />
              <Row label="Last Heartbeat" value={formatDate(selected?.last_heartbeat_at)} />
              <Row label="utm_source" value={selected?.utm_source || '—'} />
              <Row label="utm_medium" value={selected?.utm_medium || '—'} />
              <Row label="utm_campaign" value={selected?.utm_campaign || '—'} />
              <Row label="utm_term" value={selected?.utm_term || '—'} />
              <Row label="utm_content" value={selected?.utm_content || '—'} />
              <Row label="referrer" value={selected?.referrer || '—'} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium break-all text-right">{value}</span>
    </div>
  );
}
