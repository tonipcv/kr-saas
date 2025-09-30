'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import Link from 'next/link';
// removed grip handle; dragging will be on the whole card
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Dynamic import to resolve server rendering issues
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

// Types for dynamic import case
type DroppableProvided = any;
type DraggableProvided = any;
type DropResult = any;

interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  interest?: string;
  status?: string;
  appointmentDate?: string;
  createdAt?: string;
  source?: string;
  referralScore?: number;
  conversionProbability?: number;
  lastActivity?: string;
  indication?: {
    name?: string;
    slug: string;
  };
}

interface Pipeline {
  id: string;
  name: string;
  description?: string;
  columns?: {
    id: string;
    title: string;
  }[];
}

// Columns aligned with doctor/referrals statuses
const columns = [
  { id: 'PENDING', title: 'Pending', color: 'bg-gray-50 text-gray-700 border-gray-200' },
  { id: 'CONTACTED', title: 'Contacted', color: 'bg-gray-50 text-gray-700 border-gray-200' },
  { id: 'CONVERTED', title: 'Converted', color: 'bg-gray-50 text-gray-700 border-gray-200' },
  { id: 'REJECTED', title: 'Rejected', color: 'bg-gray-50 text-gray-700 border-gray-200' },
];

export default function PipelinePage() {
  const { data: session, status } = useSession();
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const isDraggingRef = useRef(false);

  const handleDragStart = () => {
    isDraggingRef.current = true;
  };

  useEffect(() => {
    if (session?.user?.id) {
      fetchLeads();
    } else if (status === 'unauthenticated') {
      setLoading(false);
      setLeads([]);
    }
  }, [session, status]);

  const fetchLeads = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: '1', limit: '100' });
      const response = await fetch(`/api/referrals/manage?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch leads');
      const data = await response.json();
      setLeads(Array.isArray(data.leads) ? data.leads : []);
    } catch (error) {
      console.error('Error fetching leads:', error);
      toast.error('Failed to load leads.');
      setLeads([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = async (result: DropResult) => {
    isDraggingRef.current = false;
    if (!result.destination) return;
    const { source, destination, draggableId } = result;
    if (source.droppableId === destination.droppableId) return;

    const newStatus = destination.droppableId; // PENDING/CONTACTED/CONVERTED/REJECTED
    const lead = leads.find((l) => l.id === draggableId);
    if (!lead) return;

    // optimistic update
    setLeads((prev) => prev.map((l) => (l.id === draggableId ? { ...l, status: newStatus } : l)));

    try {
      const res = await fetch('/api/referrals/manage', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: draggableId, status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed to update status');
      toast.success(`${lead.name} moved to ${newStatus.toLowerCase()}`);
    } catch (e) {
      // rollback on failure
      setLeads((prev) => prev.map((l) => (l.id === draggableId ? { ...l, status: source.droppableId } : l)));
      toast.error('Could not update lead status.');
    }
  };

  const getColumnLeads = (columnId: string) => {
    if (!Array.isArray(leads)) return [];
    try {
      return leads.filter((lead) => lead.status === columnId);
    } catch (error) {
      console.error('Error filtering leads for column:', columnId, error);
      return [];
    }
  };

  const getLeadInitials = (name: string) => name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  const isSyntheticEmail = (e?: string | null) => !!e && /@noemail\.local$/i.test(e);

  // Open modal on card click
  const openLeadModal = (lead: any) => {
    setSelectedLead(lead);
    setUpdateStatus(lead?.status || 'PENDING');
    setManageOpen(true);
  };

  // Apply status update from modal
  const applyLeadUpdate = async () => {
    if (!selectedLead || !updateStatus) return;
    setSaving(true);
    try {
      const res = await fetch('/api/referrals/manage', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: selectedLead.id, status: updateStatus }),
      });
      if (!res.ok) throw new Error('Failed to update');
      setLeads((prev) => prev.map((l) => (l.id === selectedLead.id ? { ...l, status: updateStatus } : l)));
      setManageOpen(false);
      setSelectedLead(null);
    } catch (e) {
      toast.error('Could not update lead.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="lg:ml-64">
          <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
            <div className="animate-pulse space-y-6">
              <div className="h-8 bg-gray-200 rounded w-64"></div>
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-96 bg-gray-100 rounded-2xl"></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <DragDropContextLib onDragEnd={handleDragEnd} onDragStart={handleDragStart}>
      <div className="min-h-screen bg-gray-50">
        <div className="lg:ml-64">
          <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
            {/* Header (compact, minimal) */}
            <div className="mb-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div>
                <h1 className="text-[18px] font-semibold text-gray-900 tracking-[-0.01em]">Pipeline</h1>
                <p className="text-xs text-gray-500">Arraste para mudar o status</p>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={fetchLeads} className="h-8 px-3 rounded-md bg-black text-white hover:bg-black/80">
                  Refresh
                </Button>
                <Button asChild variant="outline" className="h-8 px-3 rounded-md border-gray-300 text-gray-700 hover:bg-gray-50">
                  <Link href="/doctor/referrals">Voltar</Link>
                </Button>
              </div>
            </div>

            {/* Pipeline Board */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              {columns.map((column) => (
                <Card key={column.id} className="bg-white border border-gray-200 shadow-sm rounded-md overflow-hidden">
                  <CardHeader className="p-3 lg:p-4 pb-2 lg:pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold text-gray-900">{column.title}</CardTitle>
                      <Badge className="bg-white text-gray-700 border border-gray-200 text-xs font-semibold rounded-md">
                        {getColumnLeads(column.id).length}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <DroppableLib droppableId={column.id} key={column.id}>
                      {(provided: DroppableProvided) => (
                        <div
                          {...provided.droppableProps}
                          ref={provided.innerRef}
                          className="space-y-2 min-h-[360px]"
                        >
                          {getColumnLeads(column.id).map((lead, index) => (
                            <DraggableLib key={lead.id} draggableId={lead.id} index={index}>
                              {(provided: DraggableProvided) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  className="bg-white rounded-md p-3 border border-gray-200 hover:border-gray-300 transition cursor-pointer"
                                  onClick={() => { if (!isDraggingRef.current) openLeadModal(lead); }}
                                  role="button"
                                  tabIndex={0}
                                >
                                  <div className="space-y-2">
                                    <div className="flex items-start justify-between">
                                      <div>
                                        <p className="text-sm font-semibold text-gray-900">{lead.name}</p>
                                        {!isSyntheticEmail(lead.email) && lead.email && (
                                          <p className="text-xs text-gray-600">{lead.email}</p>
                                        )}
                                      </div>
                                      <Badge className="bg-gray-100 text-gray-800 rounded-md px-2 py-0.5 text-[10px] font-medium">
                                        {lead.status}
                                      </Badge>
                                    </div>
                                    <div className="text-[11px] text-gray-500">{new Date(lead.createdAt).toLocaleDateString('en-US')}</div>
                                  </div>
                                </div>
                              )}
                            </DraggableLib>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </DroppableLib>
                  </CardContent>
                </Card>
              ))}
            </div>
            {/* Manage Lead Modal */}
            <Dialog open={manageOpen} onOpenChange={setManageOpen}>
              <DialogContent className="bg-white rounded-2xl">
                <DialogHeader>
                  <DialogTitle className="text-base font-bold text-gray-900">Lead</DialogTitle>
                  <DialogDescription className="text-xs text-gray-600">Atualize o status do lead</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                    <p className="text-sm text-gray-900"><strong>Nome:</strong> {selectedLead?.name}</p>
                    {!isSyntheticEmail(selectedLead?.email) && selectedLead?.email && (
                      <p className="text-sm text-gray-900"><strong>Email:</strong> {selectedLead.email}</p>
                    )}
                    {selectedLead?.phone && (
                      <p className="text-sm text-gray-900"><strong>Phone:</strong> {selectedLead.phone}</p>
                    )}
                    <p className="text-sm text-gray-900"><strong>Data:</strong> {selectedLead?.createdAt ? new Date(selectedLead.createdAt).toLocaleDateString('pt-BR') : '—'}</p>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-gray-900">Status</p>
                    <Select value={updateStatus} onValueChange={setUpdateStatus}>
                      <SelectTrigger className="mt-2 bg-white border-gray-300 text-gray-900 rounded-md h-9">
                        <SelectValue placeholder="Selecionar" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PENDING">Pending</SelectItem>
                        <SelectItem value="CONTACTED">Contacted</SelectItem>
                        <SelectItem value="CONVERTED">Converted</SelectItem>
                        <SelectItem value="REJECTED">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={applyLeadUpdate} disabled={saving} className="bg-black hover:bg-black/80 text-white rounded-md h-8 px-4 text-sm">
                    {saving ? 'Salvando...' : 'Salvar'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </DragDropContextLib>
  );
}
 