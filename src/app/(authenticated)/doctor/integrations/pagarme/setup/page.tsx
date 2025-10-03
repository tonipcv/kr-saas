"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useClinic } from '@/contexts/clinic-context';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'react-hot-toast';

export default function PagarmeSetupPage() {
  const router = useRouter();
  const { currentClinic } = useClinic();

  const [name, setName] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [motherName, setMotherName] = useState('');
  const [birthdate, setBirthdate] = useState(''); // dd/mm/yyyy
  const [monthlyIncome, setMonthlyIncome] = useState<string>('');
  const [occupation, setOccupation] = useState('');

  const [bank, setBank] = useState('');
  const [agency, setAgency] = useState('');
  const [agencyDigit, setAgencyDigit] = useState('');
  const [account, setAccount] = useState('');
  const [accountDigit, setAccountDigit] = useState('');
  const [accountType, setAccountType] = useState<'conta_corrente'|'conta_poupanca'|''>('');
  const [saving, setSaving] = useState(false);

  // Address
  const [addrStreet, setAddrStreet] = useState('');
  const [addrStreetNumber, setAddrStreetNumber] = useState('');
  const [addrComplementary, setAddrComplementary] = useState('');
  const [addrNeighborhood, setAddrNeighborhood] = useState('');
  const [addrCity, setAddrCity] = useState('');
  const [addrState, setAddrState] = useState('');
  const [addrZip, setAddrZip] = useState('');
  const [addrRef, setAddrRef] = useState('');

  // Prefill email/phone from clinic once
  useEffect(() => {
    const preEmail = (currentClinic as any)?.email || (currentClinic as any)?.contactEmail || '';
    const prePhone = (currentClinic as any)?.phone || (currentClinic as any)?.contactPhone || '';
    if (!email && preEmail) setEmail(preEmail);
    if (!phone && prePhone) setPhone(prePhone);
  }, [currentClinic]);

  // Simple validators
  const onlyDigits = (s: string) => s.replace(/\D/g, '');
  const isHttpUrl = (s: string) => /^https?:\/\//i.test(s.trim());
  const isBirthdate = (s: string) => /^\d{2}\/\d{2}\/\d{4}$/.test(s.trim());
  const isUF = (s: string) => /^[A-Za-z]{2}$/.test(s.trim());
  const isEmail = (s: string) => /.+@.+\..+/.test(s.trim());

  function validateForm(): string[] {
    const errs: string[] = [];
    // Legal
    if (!name.trim()) errs.push('Informe a razão social / nome.');
    const docDigits = onlyDigits(documentNumber);
    if (!(docDigits.length === 11 || docDigits.length === 14)) errs.push('Documento deve ter 11 (CPF) ou 14 (CNPJ) dígitos.');
    if (!email.trim() || !isEmail(email)) errs.push('Email inválido.');
    const phoneDigits = onlyDigits(phone);
    if (!(phoneDigits.length >= 10 && phoneDigits.length <= 13)) errs.push('Telefone inválido. Use E.164 (+5511999999999) ou DDD+Número (10-11 dígitos).');

    // register_information required by v5 (individual)
    if (!birthdate.trim() || !isBirthdate(birthdate)) errs.push('Data de nascimento inválida. Use dd/mm/aaaa.');
    if (!monthlyIncome || Number.isNaN(Number(monthlyIncome)) || Number(monthlyIncome) <= 0) errs.push('Renda mensal inválida (use valor em centavos, ex.: 120000).');
    if (!occupation.trim()) errs.push('Informe a ocupação profissional.');
    if (siteUrl.trim() && !isHttpUrl(siteUrl)) errs.push('Site inválido. Inclua http:// ou https://');

    // Address
    if (!addrStreet.trim()) errs.push('Informe a rua.');
    if (!addrStreetNumber.trim()) errs.push('Informe o número.');
    if (!addrNeighborhood.trim()) errs.push('Informe o bairro.');
    if (!addrCity.trim()) errs.push('Informe a cidade.');
    if (!addrState.trim() || !isUF(addrState)) errs.push('UF inválida (ex.: SP).');
    const zipDigits = onlyDigits(addrZip);
    if (zipDigits.length !== 8) errs.push('CEP deve ter 8 dígitos (somente números).');

    // Bank (if any is filled, require all mínimos)
    const hasAnyBankField = [bank, agency, account, accountType].some((v) => v && v.trim());
    if (hasAnyBankField) {
      if (onlyDigits(bank).length < 3) errs.push('Banco inválido (código com 3 dígitos).');
      if (onlyDigits(agency).length < 3) errs.push('Agência inválida.');
      if (onlyDigits(account).length < 1) errs.push('Conta inválida.');
      if (!accountType) errs.push('Selecione o tipo de conta.');
      const dAcc = onlyDigits(account);
      if (!(dAcc.length >= 4 && dAcc.length <= 12)) errs.push('Conta deve ter entre 4 e 12 dígitos.');
    }

    return errs;
  }

  async function onSubmit() {
    if (!currentClinic?.id) return toast.error('Selecione uma clínica');
    const errors = validateForm();
    if (errors.length) {
      toast.error(errors[0]);
      return;
    }
    try {
      setSaving(true);
      const legalInfo: any = {
        name: name.trim(),
        document_number: documentNumber.trim(),
        email: email.trim() || undefined,
        phone_number: phone.trim() || undefined,
        register_information: {
          name: name.trim(),
          email: email.trim() || undefined,
          document: documentNumber.trim(),
          type: 'individual',
          site_url: siteUrl.trim() || undefined,
          mother_name: motherName.trim() || undefined,
          birthdate: birthdate.trim() || undefined,
          monthly_income: monthlyIncome ? Number(monthlyIncome) : undefined,
          professional_occupation: occupation.trim() || undefined,
          address: {
            street: addrStreet.trim() || undefined,
            street_number: addrStreetNumber.trim() || undefined,
            complementary: addrComplementary.trim() || undefined,
            neighborhood: addrNeighborhood.trim() || undefined,
            city: addrCity.trim() || undefined,
            state: addrState.trim() || undefined,
            zip_code: addrZip.trim() || undefined,
            reference_point: addrRef.trim() || undefined,
          },
        },
      };
      const bankAccount: any = bank && agency && account && accountType ? {
        bank_code: bank.trim(),
        agencia: agency.trim(),
        branch_check_digit: agencyDigit.trim() || undefined,
        conta: account.trim(),
        account_check_digit: accountDigit.trim() || undefined,
        type: accountType,
      } : {};
      const res = await fetch('/api/payments/pagarme/recipient', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId: currentClinic.id,
          legalInfo,
          bankAccount,
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      toast.success('Dados salvos. Recipient configurado.');
      router.push('/doctor/integrations');
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao configurar recebedor');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Configurar Pagamentos (Pagar.me)</h1>
              <p className="text-sm text-gray-500">Preencha os dados abaixo para receber repasses. Você pode ajustar o split e a taxa de plataforma.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => router.push('/doctor/integrations')}>Cancelar</Button>
              <Button onClick={onSubmit} disabled={saving} className="bg-gray-900 text-white hover:bg-black">{saving ? 'Salvando…' : 'Salvar'}</Button>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Form */}
            <div className="xl:col-span-2">
              <div className="rounded-2xl border border-gray-200 p-5">
                <div className="text-xs font-semibold text-gray-700 mb-3">Dados legais</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-[12px] text-gray-600 mb-1">Razão social / Nome completo</div>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Clínica Exemplo LTDA" className="h-10" />
                  </div>
                  <div>
                    <div className="text-[12px] text-gray-600 mb-1">Documento (CPF/CNPJ)</div>
                    <Input value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} placeholder="Somente números" className="h-10" />
                  </div>
                  <div>
                    <div className="text-[12px] text-gray-600 mb-1">Email de contato</div>
                    <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@dominio.com" className="h-10" />
                  </div>
                  <div>
                    <div className="text-[12px] text-gray-600 mb-1">Telefone (E.164)</div>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+5511999999999" className="h-10" />
                  </div>
                  <div>
                    <div className="text-[12px] text-gray-600 mb-1">Site (URL)</div>
                    <Input value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="https://clinica.com" className="h-10" />
                  </div>
                  <div>
                    <div className="text-[12px] text-gray-600 mb-1">Nome da mãe</div>
                    <Input value={motherName} onChange={(e) => setMotherName(e.target.value)} placeholder="Maria Exemplo" className="h-10" />
                  </div>
                  <div>
                    <div className="text-[12px] text-gray-600 mb-1">Data de nascimento</div>
                    <Input value={birthdate} onChange={(e) => setBirthdate(e.target.value)} placeholder="dd/mm/aaaa" className="h-10" />
                  </div>
                  <div>
                    <div className="text-[12px] text-gray-600 mb-1">Renda mensal (R$ centavos)</div>
                    <Input type="number" value={monthlyIncome} onChange={(e) => setMonthlyIncome(e.target.value)} placeholder="ex.: 120000" className="h-10" />
                  </div>
                  <div>
                    <div className="text-[12px] text-gray-600 mb-1">Ocupação profissional</div>
                    <Input value={occupation} onChange={(e) => setOccupation(e.target.value)} placeholder="Dentista" className="h-10" />
                  </div>
                </div>

                <div className="mt-6 text-xs font-semibold text-gray-700 mb-3">Dados bancários</div>
                <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                  <div>
                    <div className="text-[12px] text-gray-600 mb-1">Banco</div>
                    <Input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="341" className="h-10" />
                  </div>
                  <div>
                    <div className="text-[12px] text-gray-600 mb-1">Agência</div>
                    <Input value={agency} onChange={(e) => setAgency(e.target.value)} placeholder="1234" className="h-10" />
                  </div>
                  <div>
                    <div className="text-[12px] text-gray-600 mb-1">Dígito ag.</div>
                    <Input value={agencyDigit} onChange={(e) => setAgencyDigit(e.target.value)} placeholder="6 (opcional)" className="h-10" />
                  </div>
                  <div>
                    <div className="text-[12px] text-gray-600 mb-1">Conta</div>
                    <Input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="12345" className="h-10" />
                  </div>
                  <div>
                    <div className="text-[12px] text-gray-600 mb-1">Dígito conta</div>
                    <Input value={accountDigit} onChange={(e) => setAccountDigit(e.target.value)} placeholder="6 (opcional)" className="h-10" />
                  </div>
                  <div>
                    <div className="text-[12px] text-gray-600 mb-1">Tipo</div>
                    <select value={accountType} onChange={(e) => setAccountType(e.target.value as any)} className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm text-gray-900">
                      <option value="" disabled>Selecione</option>
                      <option value="conta_corrente">conta_corrente</option>
                      <option value="conta_poupanca">conta_poupanca</option>
                    </select>
                  </div>
                </div>

                <div className="mt-6 text-xs font-semibold text-gray-700 mb-3">Endereço</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <div className="text-[12px] text-gray-600 mb-1">Rua</div>
                    <Input value={addrStreet} onChange={(e) => setAddrStreet(e.target.value)} placeholder="Rua Exemplo" className="h-10" />
                  </div>
                  <div>
                    <div className="text-[12px] text-gray-600 mb-1">Número</div>
                    <Input value={addrStreetNumber} onChange={(e) => setAddrStreetNumber(e.target.value)} placeholder="123" className="h-10" />
                  </div>
                  <div>
                    <div className="text-[12px] text-gray-600 mb-1">Complemento</div>
                    <Input value={addrComplementary} onChange={(e) => setAddrComplementary(e.target.value)} placeholder="Sala 1001" className="h-10" />
                  </div>
                  <div>
                    <div className="text-[12px] text-gray-600 mb-1">Bairro</div>
                    <Input value={addrNeighborhood} onChange={(e) => setAddrNeighborhood(e.target.value)} placeholder="Centro" className="h-10" />
                  </div>
                  <div>
                    <div className="text-[12px] text-gray-600 mb-1">Cidade</div>
                    <Input value={addrCity} onChange={(e) => setAddrCity(e.target.value)} placeholder="Sao Paulo" className="h-10" />
                  </div>
                  <div>
                    <div className="text-[12px] text-gray-600 mb-1">UF</div>
                    <Input value={addrState} onChange={(e) => setAddrState(e.target.value)} placeholder="SP" className="h-10" />
                  </div>
                  <div>
                    <div className="text-[12px] text-gray-600 mb-1">CEP</div>
                    <Input value={addrZip} onChange={(e) => setAddrZip(e.target.value)} placeholder="01001000" className="h-10" />
                  </div>
                  <div className="md:col-span-3">
                    <div className="text-[12px] text-gray-600 mb-1">Ponto de referência</div>
                    <Input value={addrRef} onChange={(e) => setAddrRef(e.target.value)} placeholder="Ao lado da praça" className="h-10" />
                  </div>
                </div>
              </div>
            </div>

            {/* Summary */}
            <div>
              <div className="rounded-2xl border border-gray-200 p-5 bg-gray-50">
                <div className="text-sm font-semibold text-gray-800">Resumo</div>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-600">Nome</span><span className="font-medium text-gray-900 truncate max-w-[60%] text-right">{name || '-'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Documento</span><span className="font-medium text-gray-900">{documentNumber || '-'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Email</span><span className="font-medium text-gray-900 truncate max-w-[60%] text-right">{email || '-'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Telefone</span><span className="font-medium text-gray-900">{phone || '-'}</span></div>
                  <div className="h-px bg-gray-200 my-2" />
                  <div className="flex justify-between"><span className="text-gray-600">Banco</span><span className="font-medium text-gray-900">{bank || '-'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Agência</span><span className="font-medium text-gray-900">{agency}{agencyDigit ? `-${agencyDigit}` : ''}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Conta</span><span className="font-medium text-gray-900">{account}{accountDigit ? `-${accountDigit}` : ''}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Tipo</span><span className="font-medium text-gray-900">{accountType || '-'}</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
