'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import Link from 'next/link';

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
    <DragDropContextLib onDragEnd={handleDragEnd}>
      <div className="min-h-screen bg-gray-50">
        <div className="lg:ml-64">
          <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
            {/* Header (mirroring doctor/referrals style) */}
            <div className="mb-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h1 className="text-[20px] font-semibold text-gray-900 tracking-[-0.01em] mb-1">Referrals Pipeline</h1>
                <p className="text-sm text-gray-500">Drag and drop to update referral status</p>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={fetchLeads} className="bg-gradient-to-r from-[#5893ec] to-[#9bcef7] hover:opacity-90 text-white rounded-xl h-9 px-4 font-medium">
                  Refresh
                </Button>
                <Button asChild variant="outline" className="rounded-xl h-9 px-3 border-gray-200 text-gray-700 hover:bg-gray-50">
                  <Link href="/doctor/referrals">Back to Referrals</Link>
                </Button>
              </div>
            </div>

            {/* Pipeline Board */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {columns.map((column) => (
                <Card key={column.id} className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                  <CardHeader className="p-4 lg:p-6 pb-3 lg:pb-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold text-gray-900">{column.title}</CardTitle>
                      <Badge className="bg-white text-gray-700 border border-gray-200 text-xs font-semibold rounded-lg">
                        {getColumnLeads(column.id).length}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <DroppableLib droppableId={column.id} key={column.id}>
                      {(provided: DroppableProvided) => (
                        <div
                          {...provided.droppableProps}
                          ref={provided.innerRef}
                          className="space-y-3 min-h-[420px]"
                        >
                          {getColumnLeads(column.id).map((lead, index) => (
                            <DraggableLib key={lead.id} draggableId={lead.id} index={index}>
                              {(provided: DraggableProvided) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  className="bg-white rounded-xl p-3 border border-gray-200 hover:border-gray-300 transition"
                                >
                                  <div className="space-y-2">
                                    <div className="flex items-start justify-between">
                                      <div>
                                        <p className="text-sm font-semibold text-gray-900">{lead.name}</p>
                                        {lead.email && <p className="text-xs text-gray-600">{lead.email}</p>}
                                      </div>
                                      <Badge className="bg-gray-100 text-gray-800 rounded-lg px-2 py-0.5 text-[10px] font-medium">
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
          </div>
        </div>
      </div>
      {/* No modal / extra icons to keep UI minimal */}
    </DragDropContextLib>
  );
}
 