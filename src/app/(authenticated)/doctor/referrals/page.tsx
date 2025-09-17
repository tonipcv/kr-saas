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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  const [activeTab, setActiveTab] = useState<'active' | 'rejected'>('active');
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

  // Filter leads based on active tab
  const filteredLeads = activeTab === 'active' 
    ? leads.filter(lead => ['PENDING', 'CONTACTED', 'CONVERTED'].includes(lead.status))
    : leads.filter(lead => lead.status === 'REJECTED');

  // Currency formatter (BRL)
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(amount || 0);

  // Calculate stats for each tab
  const activeStats = {
    pending: stats?.pending || 0,
    contacted: stats?.contacted || 0,
    converted: stats?.converted || 0,
    total: (stats?.pending || 0) + (stats?.contacted || 0) + (stats?.converted || 0)
  };

  const rejectedStats = {
    rejected: stats?.rejected || 0
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="lg:ml-64">
          <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
            {/* Header Skeleton */}
            <div className="flex justify-between items-start mb-8">
              <div>
                <div className="h-8 bg-gray-200 rounded-lg w-32 mb-2 animate-pulse"></div>
                <div className="h-5 bg-gray-100 rounded-lg w-64 animate-pulse"></div>
              </div>
              <div className="flex gap-3">
                <div className="h-12 bg-gray-200 rounded-xl w-32 animate-pulse"></div>
                <div className="h-12 bg-gray-200 rounded-xl w-40 animate-pulse"></div>
              </div>
            </div>

            {/* Tabs Skeleton */}
            <div className="flex space-x-1 mb-8">
              <div className="h-12 bg-gray-200 rounded-xl w-32 animate-pulse"></div>
              <div className="h-12 bg-gray-200 rounded-xl w-32 animate-pulse"></div>
            </div>

            {/* Stats Cards Skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i} className="bg-white border-gray-200 shadow-lg rounded-2xl">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="h-4 bg-gray-100 rounded w-16 mb-2 animate-pulse"></div>
                        <div className="h-8 bg-gray-200 rounded w-12 animate-pulse"></div>
                      </div>
                      <div className="h-8 w-8 bg-gray-100 rounded-lg animate-pulse"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Table Skeleton */}
            <Card className="bg-white border-gray-200 shadow-lg rounded-2xl">
              <CardHeader className="pb-4">
                <div className="h-6 bg-gray-200 rounded-lg w-32 animate-pulse"></div>
              </CardHeader>
              <CardContent>
                {/* Table Header */}
                <div className="grid grid-cols-6 gap-4 p-4 border-b border-gray-200">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="h-4 bg-gray-100 rounded animate-pulse"></div>
                  ))}
                </div>
                
                {/* Table Rows */}
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="grid grid-cols-6 gap-4 p-4 border-b border-gray-100">
                    <div className="h-4 bg-gray-100 rounded animate-pulse"></div>
                    <div className="h-4 bg-gray-100 rounded animate-pulse"></div>
                    <div className="h-6 bg-gray-100 rounded-full w-20 animate-pulse"></div>
                    <div className="h-4 bg-gray-100 rounded animate-pulse"></div>
                    <div className="h-4 bg-gray-100 rounded animate-pulse"></div>
                    <div className="h-8 bg-gray-100 rounded-lg w-16 animate-pulse"></div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (!currentClinic) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="lg:ml-64">
          <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24 flex items-center justify-center min-h-[calc(100vh-88px)]">
            <Card className="w-full max-w-md bg-white border-gray-200 shadow-lg rounded-2xl">
              <CardHeader className="text-center p-6">
                <CardTitle className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
                  Select a Clinic
                </CardTitle>
                <CardDescription className="text-gray-600 font-medium mt-2">
                  Please select a clinic from the sidebar to view referrals.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
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
                <h1 className="text-[18px] font-semibold text-gray-900 tracking-[-0.01em] mb-0.5">Referrals</h1>
                <p className="text-xs text-gray-500">Manage referral leads and track conversions</p>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild variant="outline" className="rounded-full h-7 px-2.5 border-gray-300 text-gray-800 hover:bg-gray-50 text-[11px]">
                  <Link href="/doctor/pipeline" className="flex items-center gap-2">
                    <span>Pipeline</span>
                  </Link>
                </Button>
                <Button onClick={copyReferralLink} className="bg-gray-900 hover:bg-gray-800 text-white rounded-full h-7 px-3 text-xs font-medium">
                  Copy referral link
                </Button>
              </div>
            </div>
          </div>


          {/* Tabs */}
          <div className="flex space-x-2 mb-6">
            <button
              onClick={() => setActiveTab('active')}
              className={`px-4 py-2 rounded-full font-semibold text-[11px] transition-all border ${
                activeTab === 'active'
                  ? 'bg-gray-900 text-white border-gray-900 shadow-sm'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-300'
              }`}
            >
              Active ({activeStats.total})
            </button>
            <button
              onClick={() => setActiveTab('rejected')}
              className={`px-4 py-2 rounded-full font-semibold text-[11px] transition-all border ${
                activeTab === 'rejected'
                  ? 'bg-gray-900 text-white border-gray-900 shadow-sm'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-300'
              }`}
            >
              Rejected ({rejectedStats.rejected})
            </button>
          </div>

          {/* Statistics - minimalist */}
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {activeTab === 'active' ? (
                <>
                  <Card className="bg-white border-gray-200 shadow-sm rounded-2xl">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-600">Pending</p>
                        <span className="text-xl font-bold text-gray-900">{stats.pending}</span>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-white border-gray-200 shadow-sm rounded-2xl">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-600">Contacted</p>
                        <span className="text-xl font-bold text-gray-900">{stats.contacted}</span>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-white border-gray-200 shadow-sm rounded-2xl">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-600">Converted</p>
                        <span className="text-xl font-bold text-gray-900">{stats.converted}</span>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-white border-gray-200 shadow-sm rounded-2xl">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-600">Conversion Rate</p>
                        <span className="text-xl font-bold text-gray-900">{activeStats.total > 0 ? Math.round((stats.converted / activeStats.total) * 100) : 0}%</span>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-white border-gray-200 shadow-sm rounded-2xl">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-600">Pending Value</p>
                        <span className="text-xl font-bold text-gray-900">{formatCurrency(stats.pendingValue ?? 0)}</span>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-white border-gray-200 shadow-sm rounded-2xl">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-600">Obtained Value</p>
                        <span className="text-xl font-bold text-gray-900">{formatCurrency(stats.obtainedValue ?? 0)}</span>
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <Card className="bg-white border-gray-200 shadow-sm rounded-2xl">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-gray-600">Rejected</p>
                      <span className="text-xl font-bold text-gray-900">{stats.rejected}</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          

          {/* Referrals Table */}
          <Card className="bg-white border-gray-200 shadow-lg rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-gray-900">
                {activeTab === 'active' ? 'Active Referrals' : 'Rejected Referrals'}
              </CardTitle>
              <CardDescription className="text-xs text-gray-600">
                {activeTab === 'active' 
                  ? 'Referrals that are pending, contacted, or converted'
                  : 'Referrals that have been rejected'
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs font-semibold text-gray-900">Name</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-900">Phone</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-900">Product</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-900">Campaign</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-900">Valor</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-900">Cupom</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-900">Referred by</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-900">Status</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-900">Date</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-900">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLeads.map((lead) => {
                    return (
                      <TableRow key={lead.id}>
                        <TableCell className="text-xs font-semibold text-gray-900">{lead.name}</TableCell>
                        <TableCell className="text-xs text-gray-700">{lead.phone || '—'}</TableCell>
                        <TableCell className="text-xs text-gray-700">
                          {lead.customFields?.productName ? (
                            <div>
                              <p className="text-xs text-gray-900">{lead.customFields.productName}</p>
                              <p className="text-[11px] text-gray-500">{lead.customFields.productCategory || '—'}</p>
                            </div>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="text-xs text-gray-700">{lead.campaign?.title || '—'}</TableCell>
                        <TableCell className="text-xs text-gray-700">
                          {typeof lead.customFields?.productPrice === 'number'
                            ? formatCurrency(lead.customFields!.productPrice as number)
                            : (typeof lead.customFields?.offer?.amount === 'number'
                                ? formatCurrency(lead.customFields!.offer!.amount as number)
                                : '—')}
                        </TableCell>
                        <TableCell className="text-xs text-gray-700">
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
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-xs font-semibold text-gray-900">{lead.referrer?.name ?? 'Direct'}</p>
                            <p className="text-[11px] text-gray-500">{lead.referrer?.email ?? '—'}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={`bg-gray-100 text-gray-800 rounded-lg px-2.5 py-0.5 text-[11px] font-medium`}>
                            {statusConfig[lead.status as keyof typeof statusConfig]?.label || lead.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-gray-700">
                          {new Date(lead.createdAt).toLocaleDateString('en-US')}
                        </TableCell>
                        <TableCell>
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button 
                                size="sm"
                                onClick={() => openUpdateDialog(lead)}
                                className="bg-gray-900 hover:bg-gray-800 text-white rounded-full h-7 px-3 text-[11px] font-semibold"
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
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {filteredLeads.length === 0 && (
                <div className="text-center py-12">
                  <div className="p-4 bg-gray-100 rounded-2xl w-16 h-16 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-gray-900 mb-2">
                    {activeTab === 'active' ? 'No active referrals found' : 'No rejected referrals found'}
                  </h3>
                  <p className="text-gray-500 font-medium">
                    {activeTab === 'active' 
                      ? 'You don\'t have any active referrals at the moment.'
                      : 'You don\'t have any rejected referrals.'
                    }
                  </p>
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-center mt-8 space-x-3">
                  <Button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className={`rounded-full h-9 px-4 font-semibold ${page === 1 ? 'bg-gray-300 text-white' : 'bg-gray-900 text-white hover:bg-gray-800'}`}
                  >
                    Previous
                  </Button>
                  <span className="flex items-center px-4 text-gray-700 font-medium">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className={`rounded-full h-9 px-4 font-semibold ${page === totalPages ? 'bg-gray-300 text-white' : 'bg-gray-900 text-white hover:bg-gray-800'}`}
                  >
                    Next
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
} 