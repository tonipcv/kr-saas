'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useClinic } from '@/contexts/clinic-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
 
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { ChevronLeftIcon as PageLeftIcon, ChevronRightIcon as PageRightIcon } from '@heroicons/react/24/outline';

interface ReferralLead {
  id: string;
  name: string;
  email: string;
  phone?: string;
  status: string;
  referralCode: string;
  createdAt: string;
  lastContactAt?: string;
  notes?: string;
  customFields?: {
    offer?: { amount?: number } | null;
    coupon?: { code: string; amount?: number | null } | null;
    productPrice?: number | null;
    productName?: string | null;
    productCategory?: string | null;
    [k: string]: any;
  } | null;
  referrer: {
    id: string;
    name: string;
    email: string;
  };
  campaign?: { id: string; slug: string; title: string } | null;
  convertedUser?: {
    id: string;
    name: string;
    email: string;
  };
  credits: Array<{
    id: string;
    amount: number;
    status: string;
  }>;
}

interface ReferralStats {
  total: number;
  pending: number;
  contacted: number;
  converted: number;
  rejected: number;
  pendingValue?: number;
  obtainedValue?: number;
}

const statusConfig = {
  PENDING: { label: 'Pending' },
  CONTACTED: { label: 'Contacted' },
  CONVERTED: { label: 'Converted' },
  REJECTED: { label: 'Rejected' },
  EXPIRED: { label: 'Expired' }
};

export default function DoctorReferralsPage() {
  const { data: session } = useSession();
  const { currentClinic } = useClinic();
  const [leads, setLeads] = useState<ReferralLead[]>([]);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<ReferralLead | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [doctorSlug, setDoctorSlug] = useState('');

  const [updateForm, setUpdateForm] = useState({
    status: '',
    notes: '',
    offerAmount: '' as string,
  });

  // Load data
  const loadData = async () => {
    if (!currentClinic) {
      setLeads([]);
      setStats(null);
      return;
    }

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '10',
        clinicId: currentClinic.id
      });

      const response = await fetch(`/api/referrals/manage?${params}`);
      const data = await response.json();

      if (response.ok) {
        setLeads(data.leads);
        setStats(data.stats);
        setTotalPages(data.pagination.pages);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.user?.id) {
      loadData();
    }
  }, [session, page, currentClinic]);

  // Load doctor's slug for referral link generation (new standard)
  useEffect(() => {
    const fetchDoctorSlug = async () => {
      try {
        const res = await fetch('/api/profile');
        if (res.ok) {
          const data = await res.json();
          if (data?.doctor_slug) {
            setDoctorSlug(String(data.doctor_slug));
          }
        }
      } catch (e) {
        console.error('Failed to load doctor slug', e);
      }
    };
    if (session?.user?.id) fetchDoctorSlug();
  }, [session?.user?.id]);

  const handleStatusUpdate = async () => {
    if (!selectedLead || !updateForm.status) return;

    setUpdating(selectedLead.id);
    try {
      const response = await fetch('/api/referrals/manage', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: selectedLead.id,
          status: updateForm.status,
          notes: updateForm.notes,
          offerAmount: updateForm.offerAmount !== '' ? Number(updateForm.offerAmount) : undefined,
        })
      });

      if (response.ok) {
        await loadData();
        setSelectedLead(null);
        setUpdateForm({ status: '', notes: '', offerAmount: '' });
      }
    } catch (error) {
      console.error('Error updating status:', error);
    } finally {
      setUpdating(null);
    }
  };

  const openUpdateDialog = (lead: ReferralLead) => {
    setSelectedLead(lead);
    setUpdateForm({
      status: lead.status,
      notes: lead.notes || '',
      offerAmount: lead.customFields?.offer?.amount != null ? String(lead.customFields.offer.amount) : '',
    });
  };

  const generateReferralLink = () => {
    const base = (process.env.NEXT_PUBLIC_APP_URL || window.location.origin).replace(/\/+$/, '');
    const slug = (doctorSlug || '').trim().replace(/^\/+/, '');
    if (!slug) {
      // If slug isn't set yet, prefer empty string so UI can handle/disable copy
      console.warn('[DoctorReferrals] doctor_slug missing. Set it in your profile to generate a shareable link.');
      return '';
    }
    return `${base}/${slug}`;
  };

  const copyReferralLink = () => {
    const link = generateReferralLink();
    if (!link) {
      console.warn('[DoctorReferrals] Unable to copy link: doctor_slug missing');
      return;
    }
    navigator.clipboard.writeText(link);
    // Here you could add a success toast
  };

  // Display all leads in a single list
  const displayLeads = leads;

  // Currency formatter (BRL)
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(amount || 0);

  // Stats cards removed from UI; stats still loaded but not displayed

  // Removed full-page loading skeleton; we show table skeleton rows instead

  if (!currentClinic) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/95">
          <div className="flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Loading" className="h-8 w-auto object-contain opacity-80" />
            <div className="h-6 w-6 rounded-full border-2 border-gray-300 border-t-transparent animate-spin" />
          </div>
        </div>
        <div className="lg:ml-64">
          <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
          {/* Header */}
          <div className="mb-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h1 className="text-[20px] font-semibold text-gray-900 tracking-[-0.01em]">Referrals</h1>
                <p className="text-sm text-gray-500 mt-1">Manage referral leads and track conversions</p>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild variant="outline" size="sm" className="h-8 text-gray-700 hover:bg-gray-50">
                  <Link href="/doctor/pipeline" className="flex items-center gap-2">
                    <span>Pipeline</span>
                  </Link>
                </Button>
                <Button onClick={copyReferralLink} size="sm" className="h-8 bg-gray-900 hover:bg-black text-white">
                  Copy referral link
                </Button>
              </div>
            </div>
          </div>


          {/* Tabs removed */}

          {/* Statistics removed */}

          

          {/* Referrals Table - styled like Purchases */}
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white text-sm">
            <table className="min-w-full">
              <thead className="bg-gray-50/80">
                <tr className="text-left text-xs text-gray-600">
                  <th className="py-2 pl-3 pr-2 font-medium sm:pl-4">Date</th>
                  <th className="px-2 py-2 font-medium">Name</th>
                  <th className="px-2 py-2 font-medium">Phone</th>
                  <th className="px-2 py-2 font-medium">Product</th>
                  <th className="px-2 py-2 font-medium">Campaign</th>
                  <th className="px-2 py-2 font-medium text-right">Valor</th>
                  <th className="px-2 py-2 font-medium">Cupom</th>
                  <th className="px-2 py-2 font-medium">Referred by</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="relative py-2 pl-2 pr-3 sm:pr-4 w-10">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white text-sm">
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={`sk-${i}`}>
                      <td className="py-2 pl-3 pr-2"><div className="h-4 w-28 bg-gray-100 rounded animate-pulse" /></td>
                      <td className="px-2 py-2"><div className="h-4 w-36 bg-gray-100 rounded animate-pulse" /></td>
                      <td className="px-2 py-2"><div className="h-4 w-28 bg-gray-100 rounded animate-pulse" /></td>
                      <td className="px-2 py-2"><div className="h-4 w-40 bg-gray-100 rounded animate-pulse" /></td>
                      <td className="px-2 py-2"><div className="h-4 w-28 bg-gray-100 rounded animate-pulse" /></td>
                      <td className="px-2 py-2"><div className="h-4 w-16 bg-gray-100 rounded animate-pulse ml-auto" /></td>
                      <td className="px-2 py-2"><div className="h-4 w-20 bg-gray-100 rounded animate-pulse" /></td>
                      <td className="px-2 py-2"><div className="h-4 w-28 bg-gray-100 rounded animate-pulse" /></td>
                      <td className="px-2 py-2"><div className="h-5 w-16 bg-gray-100 rounded-full animate-pulse" /></td>
                      <td className="py-2 pl-2 pr-3 sm:pr-4 text-right"><div className="h-8 w-8 bg-gray-100 rounded-lg animate-pulse inline-block" /></td>
                    </tr>
                  ))
                ) : displayLeads.length === 0 ? (
                  <tr><td className="px-6 py-6 text-sm text-gray-500" colSpan={10}>No referrals found.</td></tr>
                ) : (
                  displayLeads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-2 py-2 text-gray-500">
                        {new Date(lead.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-gray-700 truncate max-w-[140px]">{lead.name}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-gray-700 truncate max-w-[120px]">{lead.phone || '—'}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-gray-700 truncate max-w-[160px]">
                        {lead.customFields?.productName ? (
                          <span>{lead.customFields.productName}</span>
                        ) : '—'}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-gray-700 truncate max-w-[160px]">{lead.campaign?.title || '—'}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-gray-900 text-right">
                        {typeof lead.customFields?.productPrice === 'number'
                          ? formatCurrency(lead.customFields!.productPrice as number)
                          : (typeof lead.customFields?.offer?.amount === 'number'
                              ? formatCurrency(lead.customFields!.offer!.amount as number)
                              : '—')}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-gray-700">
                        {lead.customFields?.coupon?.code ? (
                          <div className="inline-flex items-center gap-2">
                            <code className="font-mono text-[11px] tracking-widest text-gray-900 bg-gray-100 rounded px-2 py-0.5">
                              {lead.customFields.coupon.code}
                            </code>
                            <button
                              type="button"
                              className="text-[11px] text-gray-700 hover:underline"
                              onClick={() => navigator.clipboard.writeText(lead.customFields!.coupon!.code)}
                            >
                              Copiar
                            </button>
                          </div>
                        ) : '—'}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-gray-700 truncate max-w-[160px]">
                        {lead.referrer?.name ?? 'Direct'}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2">
                        <Badge className={`bg-gray-100 text-gray-800 rounded-lg px-2.5 py-0.5 text-[11px] font-medium`}>
                          {statusConfig[lead.status as keyof typeof statusConfig]?.label || lead.status}
                        </Badge>
                      </td>
                      <td className="relative whitespace-nowrap py-2 pl-2 pr-3 text-right sm:pr-4">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button 
                              size="sm"
                              onClick={() => openUpdateDialog(lead)}
                              className="h-7 bg-gray-900 hover:bg-black text-white"
                            >
                              Manage
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="bg-white rounded-2xl">
                            <DialogHeader>
                              <DialogTitle className="text-base font-bold text-gray-900">Manage Referral</DialogTitle>
                              <DialogDescription className="text-xs text-gray-600">
                                Update the status and add notes about this referral
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-6">
                              <div>
                                <Label className="text-sm font-semibold text-gray-900">Referral Data</Label>
                                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 mt-2">
                                  <p className="text-sm text-gray-900"><strong>Name:</strong> {selectedLead?.name}</p>
                                  <p className="text-sm text-gray-900"><strong>Phone:</strong> {selectedLead?.phone || 'Not provided'}</p>
                                  <p className="text-sm text-gray-900"><strong>Product:</strong> {selectedLead?.customFields?.productName ?? '—'}{selectedLead?.customFields?.productCategory ? ` (${selectedLead?.customFields?.productCategory})` : ''}</p>
                                  <p className="text-sm text-gray-900"><strong>Campaign:</strong> {selectedLead?.campaign?.title || '—'}</p>
                                  <p className="text-sm text-gray-900"><strong>Valor:</strong> {typeof selectedLead?.customFields?.productPrice === 'number'
                                    ? formatCurrency(selectedLead!.customFields!.productPrice as number)
                                    : (typeof selectedLead?.customFields?.offer?.amount === 'number'
                                        ? formatCurrency(selectedLead!.customFields!.offer!.amount as number)
                                        : '—')}
                                  </p>
                                  <p className="text-sm text-gray-900"><strong>Cupom:</strong> {selectedLead?.customFields?.coupon?.code ?? '—'}</p>
                                  <p className="text-sm text-gray-900"><strong>Referred by:</strong> {selectedLead?.referrer?.name ?? 'Direct'}</p>
                                </div>
                              </div>

                              <div>
                                <Label htmlFor="offerAmount" className="text-sm font-semibold text-gray-900">Valor (interno)</Label>
                                <Input
                                  id="offerAmount"
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={updateForm.offerAmount}
                                  onChange={(e) => setUpdateForm(prev => ({ ...prev, offerAmount: e.target.value }))}
                                  placeholder="Ex.: 199.90"
                                  className="mt-2 bg-white border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] text-gray-900 rounded-xl h-10 font-medium"
                                />
                                <p className="text-xs text-gray-500 mt-1">Não exibido publicamente. Usado apenas para registro do lead.</p>
                              </div>

                              <div>
                                <Label htmlFor="status" className="text-sm font-semibold text-gray-900">Status</Label>
                                <Select value={updateForm.status} onValueChange={(value) => setUpdateForm(prev => ({ ...prev, status: value }))}>
                                  <SelectTrigger className="mt-2 bg-white border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] text-gray-900 rounded-xl h-10 font-medium">
                                    <SelectValue placeholder="Select status" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="PENDING">Pending</SelectItem>
                                    <SelectItem value="CONTACTED">Contacted</SelectItem>
                                    <SelectItem value="CONVERTED">Converted</SelectItem>
                                    <SelectItem value="REJECTED">Rejected</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>

                              <div>
                                <Label htmlFor="notes" className="text-sm font-semibold text-gray-900">Notes</Label>
                                <Textarea
                                  id="notes"
                                  value={updateForm.notes}
                                  onChange={(e) => setUpdateForm(prev => ({ ...prev, notes: e.target.value }))}
                                  placeholder="Add notes about the contact..."
                                  rows={3}
                                  className="mt-2 bg-white border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] text-gray-900 placeholder:text-gray-500 rounded-xl font-medium text-sm"
                                />
                              </div>
                            </div>

                            <DialogFooter>
                              <Button 
                                onClick={handleStatusUpdate}
                                disabled={updating === selectedLead?.id}
                                className="bg-gray-900 hover:bg-gray-800 text-white rounded-xl h-9 px-5 text-sm font-semibold"
                              >
                                {updating === selectedLead?.id ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Updating...
                                  </>
                                ) : (
                                  'Update'
                                )}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-gray-600">Page {page} of {totalPages}</p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-gray-700 hover:bg-gray-50"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <PageLeftIcon className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-gray-700 hover:bg-gray-50"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  <PageRightIcon className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          
        </div>
      </div>
    </div>
  );
}
 