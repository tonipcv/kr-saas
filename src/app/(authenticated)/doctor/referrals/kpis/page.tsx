/* eslint-disable */
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import dynamic from 'next/dynamic';
 

interface KpisResponse {
  success: boolean;
  data: {
    leadsRecebidos: number;
    leadsConvertidos: number;
    valorGerado: number;
    recompensasPendentes: number;
  };
}

interface ReferralLead {
  id: string;
  name: string;
  email: string;
  phone?: string;
  status: 'PENDING' | 'CONTACTED' | 'CONVERTED' | 'REJECTED' | string;
  referralCode: string;
  createdAt: string;
  lastContactAt?: string;
  notes?: string;
  referrer?: {
    id: string;
    name: string;
    email: string;
  };
}

// DnD dynamic imports (client-only)
const DragDropContextLib = dynamic(
  () => import('@hello-pangea/dnd').then(mod => mod.DragDropContext),
  { ssr: false }
);
const DroppableLib = dynamic(
  () => import('@hello-pangea/dnd').then(mod => mod.Droppable),
  { ssr: false }
);
const DraggableLib = dynamic(
  () => import('@hello-pangea/dnd').then(mod => mod.Draggable),
  { ssr: false }
);
type DropResult = any;

export default function ReferralKpisPage() {
  const [data, setData] = useState<KpisResponse['data'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leads, setLeads] = useState<ReferralLead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [leadsError, setLeadsError] = useState<string | null>(null);

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result || {};
    if (!destination) return;
    if (destination.droppableId === source?.droppableId) return; // ignore reorders for now

    const lead = leads.find(l => l.id === draggableId);
    if (!lead) return;

    const prevLeads = leads;
    const nextLeads = leads.map(l =>
      l.id === draggableId ? { ...l, status: destination.droppableId } : l
    );
    setLeads(nextLeads); // optimistic

    try {
      const response = await fetch('/api/referrals/manage', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: draggableId,
          status: destination.droppableId,
          notes: ''
        })
      });
      if (!response.ok) throw new Error(`Update failed: ${response.status}`);
    } catch (e) {
      // revert on error
      setLeads(prevLeads);
      // you can surface a toast here if available
      console.error('Erro ao atualizar status:', e);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/v2/doctor/referrals/kpis', { cache: 'no-store' });
        if (!res.ok) {
          throw new Error(`Request failed: ${res.status}`);
        }
        const json: KpisResponse = await res.json();
        setData(json.data);
      } catch (err: any) {
        setError(err?.message || 'Erro ao carregar KPIs');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    const fetchLeads = async () => {
      try {
        setLeadsLoading(true);
        const params = new URLSearchParams({ page: '1', limit: '20' });
        const res = await fetch(`/api/referrals/manage?${params.toString()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Leads request failed: ${res.status}`);
        const json = await res.json();
        setLeads(Array.isArray(json?.leads) ? json.leads : []);
      } catch (err: any) {
        setLeadsError(err?.message || 'Erro ao carregar leads');
        setLeads([]);
      } finally {
        setLeadsLoading(false);
      }
    };
    fetchLeads();
  }, []);

  return (
    <div className="lg:ml-64">
      <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24 bg-gray-50">
        {/* Header */}
        <div className="flex flex-col gap-3 mb-4">
          <div className="flex items-center justify-between">
            <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Referral health</h1>
            <div className="flex items-center gap-2">
              <button className="hidden lg:inline-flex h-8 items-center rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50">View reports</button>
              <button className="inline-flex h-8 items-center rounded-full bg-gradient-to-r from-[#5893ec] to-[#9bcef7] px-3 text-xs font-medium text-white hover:opacity-90 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#5893ec]">Automate referrals</button>
            </div>
          </div>
          {/* Top Tabs (pills) */}
          <div className="flex items-center gap-2 overflow-auto">
            {[
              { key: 'health', label: 'Referral health center', active: true },
              { key: 'crm', label: 'CRM' },
              { key: 'csv', label: 'CSV' },
              { key: 'alerts', label: 'Alerts' }
            ].map(tab => (
              <span
                key={tab.key}
                className={[
                  'whitespace-nowrap text-xs font-medium rounded-full border px-3 py-1',
                  tab.active
                    ? 'bg-white border-gray-200 text-gray-900 shadow-sm'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-white'
                ].join(' ')}
              >
                {tab.label}
              </span>
            ))}
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                <div className="text-[11px] text-gray-500 font-medium mb-2">Carregando...</div>
                <div className="h-6 w-24 bg-gray-100 rounded animate-pulse" />
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-sm text-red-500">{error}</div>
        )}

        {/* KPIs */}
        {data && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-2">
            {/* KPI pill cards */}
            {[{
              title: 'Leads recebidos',
              value: data.leadsRecebidos,
              note: 'últimos 30 dias'
            }, {
              title: 'Leads convertidos',
              value: data.leadsConvertidos,
              note: 'últimos 30 dias'
            }, {
              title: 'Valor gerado',
              value: data.valorGerado.toLocaleString(undefined, { style: 'currency', currency: 'BRL' }),
              note: 'total'
            }, {
              title: 'Recompensas pendentes',
              value: data.recompensasPendentes,
              note: 'para aprovar'
            }].map((kpi) => (
              <div key={kpi.title} className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-gray-500">{kpi.title}</span>
                  <span className="text-[10px] text-gray-400">{kpi.note}</span>
                </div>
                <div className="mt-1 text-[22px] leading-7 font-semibold text-gray-900">{kpi.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Pipeline */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-900">Pipeline</h2>
            {leadsError && <span className="text-xs text-red-500 font-medium">{leadsError}</span>}
          </div>
          {leadsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {[1,2,3,4].map(i => (
                <div key={i} className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <div className="px-3 py-2.5 border-b border-gray-100 rounded-t-2xl">
                    <div className="h-4 w-24 bg-gray-100 rounded animate-pulse" />
                  </div>
                  <div className="p-3 space-y-2">
                    {[...Array(3)].map((_, j) => (
                      <div key={j} className="h-9 bg-gray-50 border border-gray-100 rounded-lg animate-pulse" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <DragDropContextLib onDragEnd={onDragEnd}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { id: 'PENDING', title: 'Pending' },
                  { id: 'CONTACTED', title: 'Contacted' },
                  { id: 'CONVERTED', title: 'Converted' },
                  { id: 'REJECTED', title: 'Rejected' },
                ].map(col => {
                  const items = leads.filter(l => l.status === col.id);
                  return (
                    <div key={col.id} className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                      <div className="px-3 py-2.5 border-b border-gray-100 rounded-t-2xl">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-gray-800">{col.title}</span>
                          <span className="text-[10px] font-medium text-gray-600 bg-gray-50 rounded-full px-2 py-0.5 border border-gray-200">{items.length}</span>
                        </div>
                      </div>
                      <DroppableLib droppableId={col.id}>
                        {(provided: any) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className="p-2 space-y-1.5 max-h-96 overflow-auto"
                          >
                            {items.slice(0, 50).map((lead, index) => (
                              <DraggableLib key={lead.id} draggableId={lead.id} index={index}>
                                {(dragProvided: any) => (
                                  <div
                                    ref={dragProvided.innerRef}
                                    {...dragProvided.draggableProps}
                                    {...dragProvided.dragHandleProps}
                                    className="group flex items-center justify-between rounded-lg border border-gray-200 bg-white hover:bg-gray-50 px-2 py-2 transition-colors shadow-xs"
                                  >
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-medium text-gray-900">{lead.name}</p>
                                      <p className="truncate text-xs text-gray-500">{lead.email}</p>
                                    </div>
                                    <span className="shrink-0 text-[10px] text-gray-400">{new Date(lead.createdAt).toLocaleDateString('pt-BR')}</span>
                                  </div>
                                )}
                              </DraggableLib>
                            ))}
                            {items.length === 0 && (
                              <div className="text-center text-xs text-gray-500 font-medium py-6 border border-dashed border-gray-200 rounded-lg">Sem leads</div>
                            )}
                            {provided.placeholder}
                          </div>
                        )}
                      </DroppableLib>
                    </div>
                  );
                })}
              </div>
            </DragDropContextLib>
          )}
        </div>
      </div>
    </div>
  );
}
