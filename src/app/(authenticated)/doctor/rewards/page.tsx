'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
import { toast } from 'sonner';

interface Reward {
  id: string;
  title: string;
  description: string;
  creditsRequired: number;
  maxRedemptions?: number;
  currentRedemptions: number;
  isActive: boolean;
  createdAt: string;
  codesAvailable?: number;
  redemptions: Array<{
    id: string;
    status: string;
    redeemedAt: string;
    user: {
      id: string;
      name: string;
      email: string;
    };
  }>;
}

export default function DoctorRewardsPage() {
  const { data: session } = useSession();
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedReward, setSelectedReward] = useState<Reward | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [planName, setPlanName] = useState<string | null>(null);
  const [isPlansOpen, setIsPlansOpen] = useState(false);
  const [plansLoading, setPlansLoading] = useState(false);
  const [availablePlans, setAvailablePlans] = useState<any[]>([]);
  // Codes management state
  const [showCodesDialog, setShowCodesDialog] = useState(false);
  const [codesRewardId, setCodesRewardId] = useState<string | null>(null);
  const [codes, setCodes] = useState<Array<{ id: string; code: string; status: string; createdAt: string }>>([]);
  const [codesLoading, setCodesLoading] = useState(false);
  const [codesSubmitting, setCodesSubmitting] = useState(false);
  const [codesForm, setCodesForm] = useState<{ quantity: string; length: string; prefix: string; manual: string }>({
    quantity: '50',
    length: '6',
    prefix: '',
    manual: ''
  });

  // Codes API helpers
  const loadCodes = async (rewardId: string) => {
    try {
      setCodesLoading(true);
      const res = await fetch(`/api/referrals/rewards/codes?rewardId=${rewardId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error loading codes');
      setCodes(data.codes || []);
    } catch (e) {
      console.error('loadCodes error', e);
    } finally {
      setCodesLoading(false);
    }
  };

  const openCodesDialog = async (rewardId: string) => {
    setCodesRewardId(rewardId);
    setShowCodesDialog(true);
    await loadCodes(rewardId);
  };

  const handleGenerateCodes = async () => {
    if (!codesRewardId) return;
    const quantity = parseInt(codesForm.quantity || '0', 10);
    const length = parseInt(codesForm.length || '6', 10);
    if (!quantity || quantity < 1) return;
    setCodesSubmitting(true);
    try {
      const res = await fetch('/api/referrals/rewards/codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rewardId: codesRewardId, quantity, length, prefix: codesForm.prefix })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Error generating codes');
        return;
      }
      await loadCodes(codesRewardId);
    } catch (e) {
      console.error('generate codes error', e);
    } finally {
      setCodesSubmitting(false);
    }
  };

  const handleImportCodes = async () => {
    if (!codesRewardId) return;
    const manual = (codesForm.manual || '')
      .split(/\n|,|;/)
      .map((s: string) => s.trim())
      .filter(Boolean);
    if (manual.length === 0) return;
    setCodesSubmitting(true);
    try {
      const res = await fetch('/api/referrals/rewards/codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rewardId: codesRewardId, codes: manual })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Error importing codes');
        return;
      }
      setCodesForm((p) => ({ ...p, manual: '' }));
      await loadCodes(codesRewardId);
    } catch (e) {
      console.error('import codes error', e);
    } finally {
      setCodesSubmitting(false);
    }
  };

  const handleDeleteCode = async (codeId: string) => {
    if (!codesRewardId) return;
    try {
      const res = await fetch(`/api/referrals/rewards/codes?codeId=${codeId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Error deleting code');
        return;
      }
      await loadCodes(codesRewardId);
    } catch (e) {
      console.error('delete code error', e);
    }
  };

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    creditsRequired: '',
    maxRedemptions: ''
  });

  // Load rewards
  const loadRewards = async () => {
    try {
      const response = await fetch('/api/referrals/rewards');
      const data = await response.json();

      if (response.ok) {
        setRewards(data.rewards);
      }
    } catch (error) {
      console.error('Error loading rewards:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.user?.id) {
      loadRewards();
    }
  }, [session]);

  // Fetch current plan name
  useEffect(() => {
    const checkPlan = async () => {
      try {
        const res = await fetch('/api/subscription/current', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setPlanName((data?.planName || '').toString());
        } else if (res.status === 404) {
          setPlanName('Free');
        }
      } catch (e) {
        console.error('Failed to check subscription', e);
      }
    };
    checkPlan();
  }, []);

  const isFree = useMemo(() => (planName || '').toLowerCase() === 'free', [planName]);
  const hasReachedFreeLimit = useMemo(() => isFree && rewards.length >= 3, [isFree, rewards.length]);

  // Plans modal loader (same pattern as Purchases)
  const openPlansModal = async () => {
    try {
      setIsPlansOpen(true);
      setPlansLoading(true);
      const res = await fetch('/api/plans', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const plans = Array.isArray(data?.plans) ? data.plans : [];
        const filtered = plans.filter((p: any) => p?.name?.toLowerCase() !== 'free');
        setAvailablePlans(filtered);
      } else {
        setAvailablePlans([]);
      }
    } catch (e) {
      console.error('Failed to load plans', e);
      setAvailablePlans([]);
    } finally {
      setPlansLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      creditsRequired: '',
      maxRedemptions: ''
    });
  };

  const handleCreate = async () => {
    if (!formData.title || !formData.description || !formData.creditsRequired) {
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/referrals/rewards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          creditsRequired: parseInt(formData.creditsRequired),
          maxRedemptions: formData.maxRedemptions ? parseInt(formData.maxRedemptions) : null
        })
      });

      if (response.ok) {
        await loadRewards();
        setShowCreateDialog(false);
        resetForm();
      }
    } catch (error) {
      console.error('Error creating reward:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async () => {
    if (!selectedReward || !formData.title || !formData.description || !formData.creditsRequired) {
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/referrals/rewards', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rewardId: selectedReward.id,
          title: formData.title,
          description: formData.description,
          creditsRequired: parseInt(formData.creditsRequired),
          maxRedemptions: formData.maxRedemptions ? parseInt(formData.maxRedemptions) : null
        })
      });

      if (response.ok) {
        await loadRewards();
        setShowEditDialog(false);
        setSelectedReward(null);
        resetForm();
      }
    } catch (error) {
      console.error('Error editing reward:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (reward: Reward) => {
    try {
      const response = await fetch('/api/referrals/rewards', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rewardId: reward.id,
          isActive: !reward.isActive
        })
      });

      if (response.ok) {
        await loadRewards();
      }
    } catch (error) {
      console.error('Error changing status:', error);
    }
  };

  const handleDelete = async (reward: Reward) => {
    if (!confirm('Are you sure you want to delete this reward?')) {
      return;
    }

    try {
      const response = await fetch(`/api/referrals/rewards?rewardId=${reward.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await loadRewards();
      } else {
        const data = await response.json();
        alert(data.error || 'Error deleting reward');
      }
    } catch (error) {
      console.error('Error deleting reward:', error);
    }
  };

  const openEditDialog = (reward: Reward) => {
    setSelectedReward(reward);
    setFormData({
      title: reward.title,
      description: reward.description,
      creditsRequired: reward.creditsRequired.toString(),
      maxRedemptions: reward.maxRedemptions?.toString() || ''
    });
    setShowEditDialog(true);
  };

  const openCreateDialog = () => {
    if (hasReachedFreeLimit) {
      openPlansModal();
      return;
    }
    resetForm();
    setShowCreateDialog(true);
  };

  const handleApproveRedemption = async (redemptionId: string) => {
    try {
      setActionLoadingId(redemptionId);
      const res = await fetch('/api/referrals/redemptions/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redemptionId })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Error approving redemption');
        return;
      }
      await loadRewards();
    } catch (e) {
      console.error('Approve error', e);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRejectRedemption = async (redemptionId: string) => {
    try {
      const reason = prompt('Enter rejection reason (optional):') || undefined;
      setActionLoadingId(redemptionId);
      const res = await fetch('/api/referrals/redemptions/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redemptionId, reason })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Error rejecting redemption');
        return;
      }
      await loadRewards();
    } catch (e) {
      console.error('Reject error', e);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleFulfillRequest = async (redemptionId: string) => {
    try {
      setActionLoadingId(redemptionId);
      const res = await fetch('/api/referrals/redemptions/fulfill-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redemptionId })
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Error requesting usage confirmation');
        return;
      }
      toast.success(data.message || 'Usage confirmation email sent to patient');
      await loadRewards();
    } catch (e) {
      console.error('Fulfill request error', e);
    } finally {
      setActionLoadingId(null);
    }
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
              <div className="h-12 bg-gray-200 rounded-xl w-32 animate-pulse"></div>
            </div>

            {/* Rewards Grid Skeleton */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Card key={i} className="bg-white border-gray-200 shadow-lg rounded-2xl">
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="h-6 bg-gray-200 rounded-lg w-3/4 mb-2 animate-pulse"></div>
                        <div className="h-4 bg-gray-100 rounded-lg w-full animate-pulse"></div>
                        <div className="h-4 bg-gray-100 rounded-lg w-2/3 mt-1 animate-pulse"></div>
                      </div>
                      <div className="h-6 w-12 bg-gray-100 rounded-full animate-pulse"></div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="h-4 bg-gray-100 rounded w-24 animate-pulse"></div>
                      <div className="h-6 bg-gray-100 rounded-full w-16 animate-pulse"></div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="h-4 bg-gray-100 rounded w-20 animate-pulse"></div>
                      <div className="h-4 bg-gray-100 rounded w-12 animate-pulse"></div>
                    </div>
                    <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
                      <div className="h-10 bg-gray-100 rounded-xl flex-1 animate-pulse"></div>
                      <div className="h-10 bg-gray-100 rounded-xl w-10 animate-pulse"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h1 className="text-xl font-semibold text-gray-900 mb-1">Rewards</h1>
              <p className="text-sm text-gray-500">Create and manage rewards for your referral program</p>
            </div>
            <Button onClick={openCreateDialog} className="bg-gradient-to-r from-[#5893ec] to-[#9bcef7] hover:opacity-90 text-white rounded-xl h-10 px-5 font-medium">
              New reward
            </Button>
          </div>

          {/* Free plan banner */}
          {isFree && (
            <div className="mb-4 rounded-2xl px-4 py-4 text-white bg-gradient-to-r from-[#5893ec] to-[#9bcef7] shadow-sm">
              <p className="text-sm font-semibold">You're on the Free plan — limited to 3 rewards.</p>
              <p className="text-xs mt-1 opacity-95">Upgrade to create unlimited rewards and unlock more features.</p>
              <div className="mt-3">
                <Button size="sm" variant="secondary" className="h-8 rounded-lg bg-white text-gray-800 hover:bg-gray-100" onClick={openPlansModal}>
                  See plans
                </Button>
              </div>
            </div>
          )}

          {/* Rewards List */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {rewards.map((reward) => (
              <Card
                key={reward.id}
                className={`relative bg-white border border-gray-200 rounded-xl hover:border-gray-300 transition ${!reward.isActive ? 'opacity-60' : ''}`}
              >
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-start">
                    <div className="min-w-0">
                      <CardTitle className="text-base font-semibold text-gray-900 truncate">
                        {reward.title}
                      </CardTitle>
                      <CardDescription className="mt-1 text-sm text-gray-600 line-clamp-2">
                        {reward.description}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Active</span>
                      <Switch
                        checked={reward.isActive}
                        onCheckedChange={() => handleToggleActive(reward)}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Credits required</span>
                      <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                        {reward.creditsRequired}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Codes available</span>
                      <span className="text-xs font-medium text-gray-900">{reward.codesAvailable ?? 0}</span>
                    </div>

                    {reward.maxRedemptions && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">Redemption limit</span>
                        <span className="text-xs font-medium text-gray-900">
                          {reward.currentRedemptions} / {reward.maxRedemptions}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Total redeemed</span>
                      <span className="text-xs font-medium text-gray-900">{reward.currentRedemptions}</span>
                    </div>

                    {reward.maxRedemptions && reward.currentRedemptions >= reward.maxRedemptions && (
                      <div className="text-gray-700 bg-gray-100 p-2.5 rounded-lg border border-gray-200">
                        <span className="text-xs">Limit reached</span>
                      </div>
                    )}

                    <div className="flex space-x-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(reward)}
                        className="flex-1 border-gray-200 bg-white text-gray-700 hover:bg-gray-50 rounded-lg h-8"
                      >
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openCodesDialog(reward.id)}
                        className="flex-1 border-gray-200 bg-white text-gray-700 hover:bg-gray-50 rounded-lg h-8"
                      >
                        Codes
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(reward)}
                        className="text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50 rounded-lg h-8 px-3"
                      >
                        Delete
                      </Button>
                    </div>

                    {/* Pending Redemptions */}
                    {reward.redemptions?.some(r => r.status === 'PENDING') && (
                      <div className="mt-4 border-t border-gray-200 pt-3">
                        <div className="text-xs text-gray-500 mb-2">Pending redemptions</div>
                        <div className="space-y-2">
                          {reward.redemptions
                            .filter(r => r.status === 'PENDING')
                            .map((r) => (
                              <div key={r.id} className="flex items-center justify-between bg-gray-50 rounded-lg p-2 border border-gray-200">
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-gray-900 truncate">{r.user.name || r.user.email}</div>
                                  <div className="text-xs text-gray-500">{new Date(r.redeemedAt).toLocaleString()}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    className="bg-gradient-to-r from-[#5893ec] to-[#9bcef7] hover:opacity-90 text-white rounded-md h-7 px-3"
                                    onClick={() => handleApproveRedemption(r.id)}
                                    disabled={actionLoadingId === r.id}
                                  >
                                    {actionLoadingId === r.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-red-200 text-red-600 hover:bg-red-50 rounded-md h-7 px-3"
                                    onClick={() => handleRejectRedemption(r.id)}
                                    disabled={actionLoadingId === r.id}
                                  >
                                    {actionLoadingId === r.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                                    Reject
                                  </Button>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Approved Redemptions */}
                    {reward.redemptions?.some(r => r.status === 'APPROVED') && (
                      <div className="mt-4 border-t border-gray-200 pt-3">
                        <div className="text-xs text-gray-500 mb-2">Approved redemptions</div>
                        <div className="space-y-2">
                          {reward.redemptions
                            .filter(r => r.status === 'APPROVED')
                            .map((r) => (
                              <div key={r.id} className="flex items-center justify-between bg-gray-50 rounded-lg p-2 border border-gray-200">
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-gray-900 truncate">{r.user.name || r.user.email}</div>
                                  <div className="text-xs text-gray-500">{new Date(r.redeemedAt).toLocaleString()}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    className="bg-gradient-to-r from-[#5893ec] to-[#9bcef7] hover:opacity-90 text-white rounded-md h-7 px-3"
                                    onClick={() => handleFulfillRequest(r.id)}
                                    disabled={actionLoadingId === r.id}
                                  >
                                    {actionLoadingId === r.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                                    Solicitar confirmação de uso
                                  </Button>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {rewards.length === 0 && (
            <Card className="bg-white border-gray-200 shadow-sm rounded-2xl">
              <CardContent className="p-8">
                <div className="text-center py-8">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">No rewards created</h3>
                  <p className="text-gray-500 font-medium mb-6">
                    Create rewards to incentivize referrals from your patients
                  </p>
                  <Button onClick={openCreateDialog} className="bg-gradient-to-r from-[#5893ec] to-[#9bcef7] hover:opacity-90 text-white rounded-xl h-10 px-5 font-medium">
                    Create first reward
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Create Reward Dialog */}
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogContent className="bg-white rounded-2xl">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold text-gray-900">New Reward</DialogTitle>
                <DialogDescription className="text-gray-600 font-medium">
                  Create a new reward for the referral system
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-6">
                <div>
                  <Label htmlFor="title" className="text-gray-900 font-semibold">Title *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="e.g., Free consultation"
                    className="mt-2 bg-white border-gray-300 focus:border-gray-900 focus:ring-gray-900 text-gray-900 placeholder:text-gray-500 rounded-xl h-10 font-medium"
                  />
                </div>

                <div>
                  <Label htmlFor="description" className="text-gray-900 font-semibold">Description *</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Describe the reward details..."
                    rows={3}
                    className="mt-2 bg-white border-gray-300 focus:border-gray-900 focus:ring-gray-900 text-gray-900 placeholder:text-gray-500 rounded-xl font-medium"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="creditsRequired" className="text-gray-900 font-semibold">Credits required *</Label>
                    <Input
                      id="creditsRequired"
                      type="number"
                      min="1"
                      value={formData.creditsRequired}
                      onChange={(e) => setFormData(prev => ({ ...prev, creditsRequired: e.target.value }))}
                      placeholder="1"
                      className="mt-2 bg-white border-gray-300 focus:border-gray-900 focus:ring-gray-900 text-gray-900 placeholder:text-gray-500 rounded-xl h-10 font-medium"
                    />
                  </div>

                  <div>
                    <Label htmlFor="maxRedemptions" className="text-gray-900 font-semibold">Redemption limit</Label>
                    <Input
                      id="maxRedemptions"
                      type="number"
                      min="1"
                      value={formData.maxRedemptions}
                      onChange={(e) => setFormData(prev => ({ ...prev, maxRedemptions: e.target.value }))}
                      placeholder="Unlimited"
                      className="mt-2 bg-white border-gray-300 focus:border-gray-900 focus:ring-gray-900 text-gray-900 placeholder:text-gray-500 rounded-xl h-10 font-medium"
                    />
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreateDialog(false)} className="border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:text-gray-900 rounded-xl h-10 px-4 font-medium">
                  Cancel
                </Button>
                <Button 
                  onClick={handleCreate}
                  disabled={submitting || !formData.title || !formData.description || !formData.creditsRequired}
                  className="bg-gradient-to-r from-[#5893ec] to-[#9bcef7] hover:opacity-90 text-white rounded-xl h-10 px-6 font-medium"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Reward'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Manage Codes Dialog */}
          <Dialog open={showCodesDialog} onOpenChange={setShowCodesDialog}>
            <DialogContent className="bg-white rounded-2xl max-w-3xl">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold text-gray-900">Manage Codes</DialogTitle>
                <DialogDescription className="text-gray-600 font-medium">
                  Generate, import and manage reward codes
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Generator */}
                <div className="lg:col-span-1 space-y-4">
                  <div>
                    <Label className="text-gray-900 font-semibold">Quantity</Label>
                    <Input
                      type="number"
                      min={1}
                      max={1000}
                      value={codesForm.quantity}
                      onChange={(e) => setCodesForm((p) => ({ ...p, quantity: e.target.value }))}
                      className="mt-2 bg-white border-gray-300 rounded-xl h-10"
                    />
                  </div>
                  <div>
                    <Label className="text-gray-900 font-semibold">Length</Label>
                    <Input
                      type="number"
                      min={4}
                      max={16}
                      value={codesForm.length}
                      onChange={(e) => setCodesForm((p) => ({ ...p, length: e.target.value }))}
                      className="mt-2 bg-white border-gray-300 rounded-xl h-10"
                    />
                  </div>
                  <div>
                    <Label className="text-gray-900 font-semibold">Prefix (optional)</Label>
                    <Input
                      value={codesForm.prefix}
                      onChange={(e) => setCodesForm((p) => ({ ...p, prefix: e.target.value }))}
                      placeholder="e.g., FREE"
                      className="mt-2 bg-white border-gray-300 rounded-xl h-10"
                    />
                  </div>
                  <Button onClick={handleGenerateCodes} disabled={codesSubmitting || !codesRewardId} className="w-full bg-gradient-to-r from-[#5893ec] to-[#9bcef7] hover:opacity-90 text-white rounded-xl h-10 font-medium">
                    {codesSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Generate
                  </Button>

                  <div className="pt-4">
                    <Label className="text-gray-900 font-semibold">Import list (comma, semicolon or newline)</Label>
                    <Textarea
                      rows={5}
                      placeholder="CODE1, CODE2, CODE3"
                      value={codesForm.manual}
                      onChange={(e) => setCodesForm((p) => ({ ...p, manual: e.target.value }))}
                      className="mt-2 bg-white border-gray-300 rounded-xl"
                    />
                    <Button onClick={handleImportCodes} disabled={codesSubmitting || !codesRewardId || !codesForm.manual.trim()} className="mt-2 w-full bg-gradient-to-r from-[#5893ec] to-[#9bcef7] hover:opacity-90 text-white rounded-xl h-10 font-semibold">
                      {codesSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Import
                    </Button>
                  </div>
                </div>

                {/* Codes list */}
                <div className="lg:col-span-2">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-semibold text-gray-700">Codes</div>
                    <Button variant="outline" size="sm" onClick={() => codesRewardId && loadCodes(codesRewardId)} className="rounded-lg">Refresh</Button>
                  </div>
                  <div className="max-h-96 overflow-auto border border-gray-200 rounded-xl">
                    {codesLoading ? (
                      <div className="p-6 text-sm text-gray-500">Loading...</div>
                    ) : codes.length === 0 ? (
                      <div className="p-6 text-sm text-gray-500">No codes yet</div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {codes.map((c) => (
                          <div key={c.id} className="flex items-center justify-between p-3">
                            <div>
                              <div className="text-sm font-semibold text-gray-900">{c.code}</div>
                              <div className="text-xs text-gray-500">{c.status}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              {c.status === 'UNUSED' && (
                                <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50 rounded-lg h-8 px-3" onClick={() => handleDeleteCode(c.id)}>
                                  Delete
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCodesDialog(false)} className="border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:text-gray-900 rounded-xl h-10 px-4 font-semibold">
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Edit Reward Dialog */}
          <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
            <DialogContent className="bg-white rounded-2xl">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold text-gray-900">Edit Reward</DialogTitle>
                <DialogDescription className="text-gray-600 font-medium">
                  Update the reward information
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-6">
                <div>
                  <Label htmlFor="edit-title" className="text-gray-900 font-semibold">Title *</Label>
                  <Input
                    id="edit-title"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="e.g., Free consultation"
                    className="mt-2 bg-white border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] text-gray-900 placeholder:text-gray-500 rounded-xl h-10 font-medium"
                  />
                </div>

                <div>
                  <Label htmlFor="edit-description" className="text-gray-900 font-semibold">Description *</Label>
                  <Textarea
                    id="edit-description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Describe the reward details..."
                    rows={3}
                    className="mt-2 bg-white border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] text-gray-900 placeholder:text-gray-500 rounded-xl font-medium"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit-creditsRequired" className="text-gray-900 font-semibold">Credits required *</Label>
                    <Input
                      id="edit-creditsRequired"
                      type="number"
                      min="1"
                      value={formData.creditsRequired}
                      onChange={(e) => setFormData(prev => ({ ...prev, creditsRequired: e.target.value }))}
                      placeholder="1"
                      className="mt-2 bg-white border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] text-gray-900 placeholder:text-gray-500 rounded-xl h-10 font-medium"
                    />
                  </div>

                  <div>
                    <Label htmlFor="edit-maxRedemptions" className="text-gray-900 font-semibold">Redemption limit</Label>
                    <Input
                      id="edit-maxRedemptions"
                      type="number"
                      min="1"
                      value={formData.maxRedemptions}
                      onChange={(e) => setFormData(prev => ({ ...prev, maxRedemptions: e.target.value }))}
                      placeholder="Unlimited"
                      className="mt-2 bg-white border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] text-gray-900 placeholder:text-gray-500 rounded-xl h-10 font-medium"
                    />
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowEditDialog(false)} className="border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:text-gray-900 rounded-xl h-10 px-4 font-semibold">
                  Cancel
                </Button>
                <Button 
                  onClick={handleEdit}
                  disabled={submitting || !formData.title || !formData.description || !formData.creditsRequired}
                  className="bg-gradient-to-r from-[#5893ec] to-[#9bcef7] hover:opacity-90 text-white rounded-xl h-10 px-6 font-semibold"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Plans Modal */}
          <Dialog open={isPlansOpen} onOpenChange={setIsPlansOpen}>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Choose a plan</DialogTitle>
              </DialogHeader>
              {plansLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[1,2].map(i => (
                    <div key={i} className="rounded-2xl border border-gray-200 bg-white p-4">
                      <div className="h-4 w-24 bg-gray-100 rounded animate-pulse mb-2" />
                      <div className="h-3 w-40 bg-gray-100 rounded animate-pulse mb-4" />
                      <div className="h-8 w-full bg-gray-100 rounded animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {availablePlans.map((plan: any) => {
                    const isCurrent = planName && planName.toLowerCase() === plan.name?.toLowerCase();
                    return (
                      <div key={plan.id} className={`rounded-2xl border border-gray-200 bg-white shadow-sm ${isCurrent ? 'ring-2 ring-blue-500' : ''}`}>
                        <div className="px-4 py-4 border-b border-gray-100 rounded-t-2xl">
                          <div className="text-sm font-semibold text-gray-900">{plan.name}</div>
                          <p className="text-xs text-gray-600">{plan.description}</p>
                          <div className="mt-3">
                            {plan.contactOnly || plan.price === null ? (
                              <div>
                                <div className="text-xl font-bold text-gray-900">Flexible billing</div>
                                <div className="text-xs text-gray-600">Custom plans</div>
                              </div>
                            ) : (
                              <div className="flex items-end gap-2">
                                <div className="text-2xl font-bold text-gray-900">$ {plan.price}</div>
                                <div className="text-xs text-gray-600 mb-1">per month</div>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="p-4">
                          <Button className="w-full bg-gradient-to-r from-[#5893ec] to-[#9bcef7] text-white hover:opacity-90">
                            {isCurrent ? 'Current plan' : 'Upgrade'}
                          </Button>
                          <div className="mt-3 space-y-2">
                            {plan.maxPatients != null && (
                              <div className="text-xs text-gray-700">Up to {plan.maxPatients} clients</div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}