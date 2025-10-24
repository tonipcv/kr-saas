"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeftIcon, CheckIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useClinic } from "@/contexts/clinic-context";

interface PageProps {
  params: Promise<{ id: string; offerId: string }>
}

interface Offer {
  id: string;
  productId: string;
  name: string;
  description?: string | null;
  currency: string;
  priceCents: number;
  maxInstallments?: number | null;
  installmentMinCents?: number | null;
  active: boolean;
  isSubscription: boolean;
  intervalCount?: number | null;
  intervalUnit?: 'DAY'|'WEEK'|'MONTH'|'YEAR' | null;
  trialDays?: number | null;
  checkoutUrl?: string | null;
  paymentMethods?: Array<{ method: 'PIX'|'CARD'; active: boolean }>
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export default function EditOfferPage({ params }: PageProps) {
  const router = useRouter();
  const [productId, setProductId] = useState<string>("");
  const [offerId, setOfferId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [methods, setMethods] = useState<{ PIX: boolean; CARD: boolean }>({ PIX: true, CARD: true });
  const { currentClinic } = useClinic();

  const [form, setForm] = useState({
    name: "",
    description: "",
    price: "",
    currency: "BRL" as 'BRL'|'USD'|'EUR',
    isSubscription: false,
    intervalCount: "1",
    intervalUnit: "MONTH" as 'DAY'|'WEEK'|'MONTH'|'YEAR',
    trialDays: "0",
    maxInstallments: "1",
    checkoutUrl: "",
    active: true,
  });

  const getBaseUrl = () => {
    // 1) Prefer APP_BASE_DOMAIN (public or server)
    const dom = (process.env.NEXT_PUBLIC_APP_BASE_DOMAIN || process.env.APP_BASE_DOMAIN) as string | undefined;
    if (dom && dom.trim()) {
      const d = dom.trim();
      const hasProto = /^https?:\/\//i.test(d);
      const url = hasProto ? d : `https://${d}`;
      return url.replace(/\/$/, '');
    }
    // 2) Fallback to previous public base URLs
    const pub = (process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_NEXTAUTH_URL) as string | undefined;
    if (pub && /^https?:\/\//.test(pub)) return pub.replace(/\/$/, '');
    // 3) Finally, window origin or localhost
    if (typeof window !== 'undefined') {
      const origin = window.location.origin;
      if (/localhost|127\.0\.0\.1/i.test(origin)) return 'https://www.zuzz.vu';
      return origin;
    }
    return 'https://www.zuzz.vu';
  };

  const getSlug = () => (currentClinic?.slug && String(currentClinic.slug)) || 'bella-vida';

  const ensureSlugInPath = (path: string) => {
    const slug = getSlug();
    if (!path) return `/${slug}/checkout/${productId}`;
    // Already slugged
    if (path.startsWith(`/${slug}/checkout/`)) return path;
    // Path like /checkout/:id → convert to /:slug/checkout/:id
    const m = path.match(/^\/checkout\/(.+)$/);
    if (m) return `/${slug}${path}`;
    // If only productId provided, build full slugged path
    if (!path.startsWith('/')) return `/${slug}/checkout/${path}`;
    return path;
  };

  const toFullCheckout = (value: string) => {
    if (!value) return '';
    const hasProto = /^https?:\/\//i.test(value);
    const base = getBaseUrl();
    if (hasProto) {
      try {
        const url = new URL(value);
        const sluggedPath = ensureSlugInPath(url.pathname);
        return `${url.origin}${sluggedPath}`;
      } catch {
        return value;
      }
    }
    const rawPath = value.startsWith('/') ? value : `/${value}`;
    const path = ensureSlugInPath(rawPath);
    return `${base}${path}`;
  };

  const normalizeCheckoutForSave = (value: string) => {
    // Save absolute URL, enforce slug in path
    return toFullCheckout(value);
  };

  useEffect(() => {
    (async () => {
      const { id, offerId } = await params;
      setProductId(id);
      setOfferId(offerId);
      await loadOffer(id, offerId);
    })();
  }, [params]);

  const loadOffer = async (pid: string, oid: string) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/products/${pid}/offers`);
      if (!res.ok) throw new Error("Failed to load offers");
      const js = await res.json();
      const found = (js?.offers || []).find((o: Offer) => o.id === oid) as Offer | undefined;
      if (found) {
        setOffer(found);
        setForm({
          name: found.name || "",
          description: found.description || "",
          price: (Number(found.priceCents || 0) / 100).toString(),
          currency: (found.currency as any) || 'BRL',
          isSubscription: !!found.isSubscription,
          intervalCount: String(found.intervalCount || 1),
          intervalUnit: (found.intervalUnit as any) || 'MONTH',
          trialDays: String(found.trialDays || 0),
          maxInstallments: String(found.maxInstallments || 1),
          // Ensure UI shows full absolute URL
          checkoutUrl: toFullCheckout(found.checkoutUrl || ''),
          active: !!found.active,
        });
        const pixOn = (found.paymentMethods || []).some(x => x.method === 'PIX' && x.active);
        const cardOn = (found.paymentMethods || []).some(x => x.method === 'CARD' && x.active);
        setMethods({ PIX: pixOn, CARD: cardOn });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!offer) return;
    try {
      setSaving(true);
      // Clamp maxInstallments according to business rules
      const monthsFromInterval = (unit: string, count: number) => {
        const u = String(unit || 'MONTH').toUpperCase();
        if (u === 'YEAR') return Math.max(1, count * 12);
        if (u === 'MONTH') return Math.max(1, count);
        if (u === 'WEEK') return Math.max(1, Math.ceil(count / 4));
        if (u === 'DAY') return Math.max(1, Math.ceil(count / 30));
        return 1;
      };
      const platformCap = 12;
      const offeredMax = Math.max(1, Number(form.maxInstallments || '1'));
      const periodMonths = form.isSubscription ? monthsFromInterval(form.intervalUnit, Number(form.intervalCount || '1')) : 0;
      const finalMaxInstallments = form.isSubscription
        ? Math.max(1, Math.min(offeredMax, periodMonths, platformCap))
        : Math.max(1, Math.min(offeredMax, platformCap));
      const body: any = {
        name: form.name || undefined,
        description: form.description || undefined,
        currency: form.currency,
        priceCents: Math.round(Math.max(0, Number((form.price || '0').replace(',', '.')) * 100)),
        isSubscription: !!form.isSubscription,
        intervalUnit: form.isSubscription ? form.intervalUnit : null,
        intervalCount: form.isSubscription ? Number(form.intervalCount || 1) : null,
        trialDays: form.isSubscription ? Number(form.trialDays || 0) : null,
        maxInstallments: finalMaxInstallments,
        active: !!form.active,
        // Save absolute URL
        checkoutUrl: normalizeCheckoutForSave(form.checkoutUrl) || undefined,
      };
      const res = await fetch(`/api/products/${productId}/offers/${offer.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error("Failed to save offer");
      // methods
      await fetch(`/api/products/${productId}/offers/${offer.id}/methods`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ methods: [ { method: 'PIX', active: methods.PIX }, { method: 'CARD', active: methods.CARD } ] }) });
      await loadOffer(productId, offer.id);
    } catch (e) {
      console.error(e);
      alert('Failed to save offer');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!offer) return;
    if (!confirm('Delete this offer?')) return;
    try {
      setDeleting(true);
      const res = await fetch(`/api/products/${productId}/offers/${offer.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      router.push(`/business/products/${productId}/edit?tab=offers`);
    } catch (e) {
      console.error(e);
      alert('Failed to delete offer');
    } finally {
      setDeleting(false);
    }
  };

  const pricePretty = useMemo(() => (Number((form.price || '0').replace(',', '.'))).toLocaleString('pt-BR', { style: 'currency', currency: form.currency }), [form.price, form.currency]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
          <div className="flex items-center gap-4 mb-4">
            <Button variant="ghost" size="sm" asChild className="h-9 rounded-xl px-3 border border-gray-200 text-gray-700 hover:bg-gray-50">
              <Link href={`/business/products/${productId}/edit`}>
                <ArrowLeftIcon className="h-4 w-4 mr-2" />
                Back to product
              </Link>
            </Button>
            <div className="flex-1 flex items-center justify-between">
              <div>
                <h1 className="text-[20px] font-semibold text-gray-900 tracking-[-0.01em]">Edit Offer</h1>
                <p className="text-sm text-gray-500 mt-1">Product ID: <span className="font-mono">{productId}</span> • Offer ID: <span className="font-mono">{offerId}</span></p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleSave} disabled={saving} className="h-9 px-3 rounded-xl bg-gray-900 hover:bg-black text-white text-sm flex items-center gap-2">{saving ? (<><div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>Saving…</>) : (<><CheckIcon className="h-4 w-4" />Save</>)}</button>
                <Button type="button" variant="outline" onClick={handleDelete} disabled={deleting} className="h-9 border-red-200 text-red-600 hover:bg-red-50">{deleting ? 'Deleting…' : (<><TrashIcon className="h-4 w-4 mr-1" />Delete</> )}</Button>
              </div>
            </div>
          </div>

          {/* Two-column content */}
          <div className="grid grid-cols-1 gap-6">
            {/* Single column (image card removed) */}
            <div className="space-y-6">
              <Card className="bg-white border-gray-200 shadow-sm rounded-2xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold text-gray-900">Checkout Links</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label className="text-gray-900 font-medium">Checkout URL (full)</Label>
                    <Input value={form.checkoutUrl} onChange={(e) => setForm(v => ({ ...v, checkoutUrl: e.target.value }))} className="mt-2 h-10" placeholder={`${getBaseUrl()}/${getSlug()}/checkout/${productId}`} />
                    <p className="text-xs text-gray-500 mt-1">Saved as an absolute URL with slug “{getSlug()}” and base {getBaseUrl()}.</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border-gray-200 shadow-sm rounded-2xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold text-gray-900">Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-gray-900 font-medium">Name</Label>
                    <Input value={form.name} onChange={(e) => setForm(v => ({ ...v, name: e.target.value }))} className="mt-2 h-10" placeholder="Offer name" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-gray-900 font-medium">Price</Label>
                      <Input type="number" step="0.01" min={0} value={form.price} onChange={(e) => setForm(v => ({ ...v, price: e.target.value }))} className="mt-2 h-10" placeholder="99.90" />
                      <div className="text-[11px] text-gray-500 mt-1">{pricePretty}</div>
                    </div>
                    <div>
                      <Label className="text-gray-900 font-medium">Currency</Label>
                      <Select value={form.currency} onValueChange={(val: any) => setForm(v => ({ ...v, currency: val }))}>
                        <SelectTrigger className="mt-2 h-10"><SelectValue placeholder="Currency" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="BRL">BRL</SelectItem>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="EUR">EUR</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end">
                      <div className="w-full">
                        <Label className="text-gray-900 font-medium">Active</Label>
                        <div className="mt-2"><Switch checked={form.active} onCheckedChange={(checked) => setForm(v => ({ ...v, active: checked }))} /></div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label className="text-gray-900 font-medium">Payment methods</Label>
                    <div className="mt-2 flex gap-2">
                      {(["PIX","CARD"] as const).map((m) => (
                        <button key={m} type="button" onClick={() => setMethods(prev => ({ ...prev, [m]: !prev[m] }))} className={`px-3 py-1.5 rounded-lg text-xs border ${methods[m] ? 'bg-gray-100 border-gray-300 text-gray-800' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}>{m}</button>
                      ))}
                    </div>
                  </div>

                  {form.isSubscription ? (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div>
                        <Label className="text-gray-900 font-medium">Every</Label>
                        <Input type="number" min={1} value={form.intervalCount} onChange={(e) => setForm(v => ({ ...v, intervalCount: e.target.value }))} className="mt-2 h-10" />
                      </div>
                      <div>
                        <Label className="text-gray-900 font-medium">Interval</Label>
                        <Select value={form.intervalUnit} onValueChange={(val: any) => setForm(v => ({ ...v, intervalUnit: val }))}>
                          <SelectTrigger className="mt-2 h-10"><SelectValue placeholder="Interval" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="DAY">Day</SelectItem>
                            <SelectItem value="WEEK">Week</SelectItem>
                            <SelectItem value="MONTH">Month</SelectItem>
                            <SelectItem value="YEAR">Year</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-gray-900 font-medium">Trial (days)</Label>
                        <Input type="number" min={0} value={form.trialDays} onChange={(e) => setForm(v => ({ ...v, trialDays: e.target.value }))} className="mt-2 h-10" />
                      </div>
                      <div>
                        <Label className="text-gray-900 font-medium">Max installments</Label>
                        <Input type="number" min={1} value={form.maxInstallments} onChange={(e) => setForm(v => ({ ...v, maxInstallments: e.target.value }))} className="mt-2 h-10" />
                        <p className="text-xs text-gray-500 mt-1">Limite: até os meses do período (1/3/6/12), máx. 12.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <Label className="text-gray-900 font-medium">Max installments</Label>
                        <Input type="number" min={1} value={form.maxInstallments} onChange={(e) => setForm(v => ({ ...v, maxInstallments: e.target.value }))} className="mt-2 h-10" />
                        <p className="text-xs text-gray-500 mt-1">Até 12x. Se o preço for menor que R$97 (one-time), será 1x.</p>
                      </div>
                    </div>
                  )}

                  <div>
                    <Label className="text-gray-900 font-medium">Description</Label>
                    <Textarea value={form.description} onChange={(e) => setForm(v => ({ ...v, description: e.target.value }))} className="mt-2" rows={4} placeholder="Optional description" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-gray-500">
                    <div>Created at: {offer?.createdAt ? new Date(offer.createdAt as any).toLocaleString() : '—'}</div>
                    <div>Updated at: {offer?.updatedAt ? new Date(offer.updatedAt as any).toLocaleString() : '—'}</div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right column removed */}
          </div>
        </div>
      </div>
    </div>
  );
}
