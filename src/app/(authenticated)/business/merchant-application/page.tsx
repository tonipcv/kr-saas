"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export default function MerchantApplicationPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPT = typeof navigator !== 'undefined' && navigator.language && navigator.language.toLowerCase().startsWith('pt');
  const i18n = {
    title: isPT ? 'Dados para habilitar sua conta' : 'Business onboarding',
    subtitle: isPT ? 'Informe os dados do negócio para ativar sua conta' : 'Provide your business details to activate your account',
    businessType: isPT ? 'Tipo do negócio' : 'Business type',
    individual: isPT ? 'Pessoa física' : 'Individual',
    company: isPT ? 'Empresa' : 'Company',
    businessName: isPT ? 'Razão social / Nome fantasia' : 'Legal/Trade name',
    document: isPT ? 'Documento (CPF/CNPJ)' : 'Document (CPF/CNPJ)',
    website: isPT ? 'Site (opcional)' : 'Website (optional)',
    industry: isPT ? 'Segmento' : 'Industry',
    repSection: isPT ? 'Representante legal' : 'Legal representative',
    repName: isPT ? 'Nome completo' : 'Full name',
    repDoc: isPT ? 'Documento (CPF)' : 'Document (National ID)',
    repDob: isPT ? 'Data de nascimento' : 'Date of birth',
    contactSection: isPT ? 'Contato' : 'Contact',
    email: 'Email',
    phone: isPT ? 'Telefone' : 'Phone',
    addressSection: isPT ? 'Endereço' : 'Address',
    street: isPT ? 'Logradouro' : 'Street',
    number: isPT ? 'Número' : 'Number',
    complement: isPT ? 'Complemento' : 'Complement',
    district: isPT ? 'Bairro' : 'District',
    city: isPT ? 'Cidade' : 'City',
    state: isPT ? 'Estado' : 'State',
    zip: isPT ? 'CEP' : 'ZIP',
    country: isPT ? 'País' : 'Country',
    bankingSection: isPT ? 'Dados bancários' : 'Banking details',
    bankCode: isPT ? 'Banco (código)' : 'Bank code',
    accountType: isPT ? 'Tipo de conta' : 'Account type',
    checking: isPT ? 'Corrente' : 'Checking',
    savings: isPT ? 'Poupança' : 'Savings',
    agency: isPT ? 'Agência' : 'Branch',
    account: isPT ? 'Conta' : 'Account',
    accountDigit: isPT ? 'Dígito' : 'Digit',
    pixKey: isPT ? 'Chave PIX (opcional)' : 'PIX key (optional)',
    uploadsSection: isPT ? 'Documentos' : 'Documents',
    uploadId: isPT ? 'Documento de identidade' : 'Identity document',
    uploadProof: isPT ? 'Comprovante de endereço' : 'Proof of address',
    terms: isPT ? 'Li e concordo com os termos' : 'I have read and agree to the terms',
    submit: isPT ? 'Enviar' : 'Submit',
  };

  useEffect(() => {
    if (!session) return;
    if ((session.user as any)?.accessGranted === true) {
      router.replace('/business/dashboard');
    }
  }, [session, router]);

  const [form, setForm] = useState({
    type: "INDIVIDUAL" as "INDIVIDUAL" | "COMPANY",
    businessName: "",
    documentNumber: "",
    website: "",
    industry: "",
    repName: "",
    repDoc: "",
    repDob: "",
    email: session?.user?.email || "",
    phone: "",
    street: "",
    number: "",
    complement: "",
    district: "",
    city: "",
    state: "",
    zip: "",
    country: "BR",
    bankCode: "",
    accountType: "CHECKING" as "CHECKING" | "SAVINGS",
    agency: "",
    account: "",
    accountDigit: "",
    pixKey: "",
    agree: false,
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (!form.agree) {
        throw new Error(isPT ? 'É necessário aceitar os termos' : 'You must accept the terms');
      }
      const res = await fetch('/api/business/merchant-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const js = await res.json();
      if (!res.ok) throw new Error(js?.error || `Request failed: ${res.status}`);
      router.replace('/business/dashboard');
    } catch (e: any) {
      setError(e?.message || 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24 bg-gray-50">
          <div className="mb-4">
            <h1 className="text-[20px] font-semibold text-gray-900 tracking-tight">{i18n.title}</h1>
            <p className="text-sm text-gray-600">{i18n.subtitle}</p>
          </div>

          {error && <div className="mb-3 text-sm text-red-600">{error}</div>}

          <form onSubmit={onSubmit} className="space-y-6 max-w-3xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-700 mb-1">{i18n.businessType}</label>
                <Select value={form.type} onValueChange={(v: any) => setForm((f) => ({ ...f, type: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder={i18n.businessType} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INDIVIDUAL">{i18n.individual}</SelectItem>
                    <SelectItem value="COMPANY">{i18n.company}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">{i18n.industry}</label>
                <Input value={form.industry} onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-700 mb-1">{i18n.businessName}</label>
                <Input required value={form.businessName} onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">{i18n.document}</label>
                <Input required value={form.documentNumber} onChange={(e) => setForm((f) => ({ ...f, documentNumber: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-700 mb-1">{i18n.website}</label>
                <Input value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">{i18n.contactSection}</label>
                <Input type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-700 mb-1">{i18n.phone}</label>
                <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">{i18n.repSection}</label>
                <Input required value={form.repName} onChange={(e) => setForm((f) => ({ ...f, repName: e.target.value }))} placeholder={i18n.repName} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm text-gray-700 mb-1">{i18n.repDoc}</label>
                <Input required value={form.repDoc} onChange={(e) => setForm((f) => ({ ...f, repDoc: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">{i18n.repDob}</label>
                <Input type="date" required value={form.repDob} onChange={(e) => setForm((f) => ({ ...f, repDob: e.target.value }))} />
              </div>
            </div>

            <div>
              <div className="text-sm font-medium text-gray-900 mb-2">{i18n.addressSection}</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-sm text-gray-700 mb-1">{i18n.street}</label>
                  <Input required value={form.street} onChange={(e) => setForm((f) => ({ ...f, street: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">{i18n.number}</label>
                  <Input required value={form.number} onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">{i18n.complement}</label>
                  <Input value={form.complement} onChange={(e) => setForm((f) => ({ ...f, complement: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">{i18n.district}</label>
                  <Input required value={form.district} onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">{i18n.city}</label>
                  <Input required value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">{i18n.state}</label>
                  <Input required value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">{i18n.zip}</label>
                  <Input required value={form.zip} onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">{i18n.country}</label>
                  <Input required value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} />
                </div>
              </div>
            </div>

            <div>
              <div className="text-sm font-medium text-gray-900 mb-2">{i18n.bankingSection}</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">{i18n.bankCode}</label>
                  <Input value={form.bankCode} onChange={(e) => setForm((f) => ({ ...f, bankCode: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">{i18n.accountType}</label>
                  <Select value={form.accountType} onValueChange={(v: any) => setForm((f) => ({ ...f, accountType: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder={i18n.accountType} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CHECKING">{i18n.checking}</SelectItem>
                      <SelectItem value="SAVINGS">{i18n.savings}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">{i18n.agency}</label>
                  <Input value={form.agency} onChange={(e) => setForm((f) => ({ ...f, agency: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">{i18n.account}</label>
                  <Input value={form.account} onChange={(e) => setForm((f) => ({ ...f, account: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">{i18n.accountDigit}</label>
                  <Input value={form.accountDigit} onChange={(e) => setForm((f) => ({ ...f, accountDigit: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">{i18n.pixKey}</label>
                  <Input value={form.pixKey} onChange={(e) => setForm((f) => ({ ...f, pixKey: e.target.value }))} />
                </div>
              </div>
            </div>

            <div>
              <div className="text-sm font-medium text-gray-900 mb-2">{i18n.uploadsSection}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">{i18n.uploadId}</label>
                  <input type="file" className="block w-full text-sm" accept="image/*,.pdf" />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">{i18n.uploadProof}</label>
                  <input type="file" className="block w-full text-sm" accept="image/*,.pdf" />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input id="agree" type="checkbox" checked={form.agree} onChange={(e) => setForm((f) => ({ ...f, agree: e.target.checked }))} />
              <label htmlFor="agree" className="text-sm text-gray-700">{i18n.terms}</label>
            </div>

            <div className="pt-2">
              <Button type="submit" disabled={submitting}>{submitting ? '...' : i18n.submit}</Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
