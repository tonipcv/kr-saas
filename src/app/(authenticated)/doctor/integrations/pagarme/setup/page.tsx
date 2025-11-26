"use client";

import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useClinic } from '@/contexts/clinic-context';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'react-hot-toast';

export default function PagarmeSetupPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { currentClinic } = useClinic();

  // Wizard state (4 steps)
  const [step, setStep] = useState<1|2|3|4>(1);
  const totalSteps = 4;

  const [name, setName] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [motherName, setMotherName] = useState('');
  const [birthdate, setBirthdate] = useState(''); // dd/mm/yyyy
  const [monthlyIncome, setMonthlyIncome] = useState<string>('');
  const [occupation, setOccupation] = useState('');

  // Bank optional toggle
  const [includeBank, setIncludeBank] = useState(false);
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

  // Inline field error map
  const [errors, setErrors] = useState<Record<string, string>>({});
  // CEP lookup state
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);
  const streetNumberRef = useRef<HTMLInputElement | null>(null);

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
    const hasAnyBankField = includeBank || [bank, agency, account, accountType].some((v) => v && v.trim());
    if (hasAnyBankField) {
      if (onlyDigits(bank).length < 3) errs.push('Banco inválido (código com 3 dígitos).');
      if (onlyDigits(agency).length < 3) errs.push('Agência inválida.');
      if (onlyDigits(account).length < 1) errs.push('Conta inválida.');
      if (!accountDigit || !accountDigit.trim()) errs.push('Dígito da conta é obrigatório.');
      if (!accountType) errs.push('Selecione o tipo de conta.');
      const dAcc = onlyDigits(account);
      if (!(dAcc.length >= 4 && dAcc.length <= 12)) errs.push('Conta deve ter entre 4 e 12 dígitos.');
    }

    return errs;
  }

  // Per-step validation to gate Next
  const validateStep = (s: 1|2|3|4): boolean => {
    const nextErrors: Record<string, string> = {};
    const docDigits = onlyDigits(documentNumber);
    const phoneDigits = onlyDigits(phone);
    const zipDigits = onlyDigits(addrZip);
    if (s === 1) {
      if (!name.trim()) nextErrors.name = 'Obrigatório';
      if (!(docDigits.length === 11 || docDigits.length === 14)) nextErrors.documentNumber = 'CPF/CNPJ inválido';
      if (!isEmail(email)) nextErrors.email = 'Email inválido';
      if (!(phoneDigits.length >= 10 && phoneDigits.length <= 13)) nextErrors.phone = 'Telefone inválido';
      if (!isBirthdate(birthdate)) nextErrors.birthdate = 'Use dd/mm/aaaa';
    } else if (s === 2) {
      if (!occupation.trim()) nextErrors.occupation = 'Obrigatório';
      if (!monthlyIncome || Number.isNaN(Number(monthlyIncome)) || Number(monthlyIncome) <= 0) nextErrors.monthlyIncome = 'Obrigatório';
      if (siteUrl.trim() && !isHttpUrl(siteUrl)) nextErrors.siteUrl = 'URL inválida';
      if (!motherName.trim()) nextErrors.motherName = 'Obrigatório';
    } else if (s === 3) {
      if (zipDigits.length !== 8) nextErrors.addrZip = 'CEP inválido';
      if (!addrStreet.trim()) nextErrors.addrStreet = 'Obrigatório';
      if (!addrStreetNumber.trim()) nextErrors.addrStreetNumber = 'Obrigatório';
      if (!addrNeighborhood.trim()) nextErrors.addrNeighborhood = 'Obrigatório';
      if (!addrCity.trim()) nextErrors.addrCity = 'Obrigatório';
      if (!addrState.trim() || !isUF(addrState)) nextErrors.addrState = 'UF inválida';
    } else if (s === 4 && (includeBank || [bank, agency, account, accountType].some(v => v && v.trim()))) {
      if (onlyDigits(bank).length < 3) nextErrors.bank = 'Banco inválido';
      if (onlyDigits(agency).length < 3) nextErrors.agency = 'Agência inválida';
      if (onlyDigits(account).length < 1) nextErrors.account = 'Conta inválida';
      if (!accountDigit.trim()) nextErrors.accountDigit = 'Obrigatório';
      if (!accountType) nextErrors.accountType = 'Obrigatório';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    setStep((s) => {
      const n = s + 1;
      const clamped = n > 4 ? 4 : (n < 1 ? 1 : n);
      return clamped as 1|2|3|4;
    });
  };
  const goBack = () => {
    setStep((s) => {
      const n = s - 1;
      const clamped = n < 1 ? 1 : (n > 4 ? 4 : n);
      return clamped as 1|2|3|4;
    });
  };

  // CEP auto-lookup using ViaCEP when 8 digits
  useEffect(() => {
    const zip = onlyDigits(addrZip);
    if (zip.length !== 8) return;
    let alive = true;
    setCepLoading(true);
    setCepError(null);
    (async () => {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${zip}/json/`);
        const js = await res.json().catch(() => ({}));
        if (!alive) return;
        if (js?.erro) {
          setCepError('CEP não encontrado');
          return;
        }
        // Overwrite fields from CEP response
        setAddrStreet(js.logradouro || '');
        setAddrNeighborhood(js.bairro || '');
        setAddrCity(js.localidade || '');
        setAddrState((js.uf || '').toUpperCase());
        // Focus on Número para continuar
        try { streetNumberRef.current?.focus(); } catch {}
      } catch {
        if (alive) setCepError('Falha ao buscar CEP');
      } finally {
        if (alive) setCepLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addrZip]);

  // ---------- Helpers para dados aleatórios de teste ----------
  function randInt(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function pick<T>(arr: T[]): T {
    return arr[randInt(0, arr.length - 1)];
  }

  function pad(n: number, size: number) {
    let s = String(n);
    while (s.length < size) s = '0' + s;
    return s;
  }

  // Gera CPF válido (11 dígitos) com DV calculado
  function generateValidCPF(): string {
    const n: number[] = Array.from({ length: 9 }, () => randInt(0, 9));
    const d1Sum = n.reduce((acc, cur, idx) => acc + cur * (10 - idx), 0);
    const d1 = (d1Sum * 10) % 11 % 10;
    const d2Sum = [...n, d1].reduce((acc, cur, idx) => acc + cur * (11 - idx), 0);
    const d2 = (d2Sum * 10) % 11 % 10;
    return [...n, d1, d2].join('');
  }

  function randomBrazilPhone(): string {
    // +55 DDD (10-11 dígitos nacionais). Usaremos formato E.164
    const ddd = pad(randInt(11, 99), 2);
    const first = randInt(6, 9); // celulares 6-9
    const rest = pad(randInt(0, 99999999), 8);
    return `+55${ddd}${first}${rest}`;
  }

  function randomBirthdate(): string {
    const year = randInt(1960, 2005);
    const month = randInt(1, 12);
    const day = randInt(1, 28); // evita meses com menos dias
    return `${pad(day, 2)}/${pad(month, 2)}/${year}`;
  }

  function randomEmail(base: string = 'teste.pagarme'): string {
    const u = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    return `${base}+${u}@example.com`;
  }

  function randomName(): string {
    const first = pick(['Ana', 'Bruno', 'Carla', 'Diego', 'Eduarda', 'Fernando', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Karina', 'Lucas', 'Mariana', 'Nicolas', 'Olivia', 'Paulo', 'Queila', 'Rafael', 'Sofia', 'Thiago']);
    const last = pick(['Silva', 'Souza', 'Oliveira', 'Santos', 'Lima', 'Pereira', 'Ferreira', 'Almeida', 'Gomes', 'Costa', 'Ribeiro', 'Carvalho']);
    const suf = pick(['ME', 'LTDA', 'EIRELI', '']);
    return `${first} ${last}${suf ? ' ' + suf : ''}`.trim();
  }

  function randomMotherName(): string {
    const first = pick(['Maria', 'Patricia', 'Juliana', 'Claudia', 'Andrea', 'Camila', 'Aline', 'Renata']);
    const last = pick(['Silva', 'Souza', 'Oliveira', 'Santos', 'Pereira', 'Fernandes']);
    return `${first} ${last}`;
  }

  function randomOccupation(): string {
    return pick(['Dentista', 'Médico', 'Fisioterapeuta', 'Psicólogo', 'Nutricionista']);
  }

  function randomMonthlyIncomeCents(): string {
    const val = randInt(50000, 500000); // R$ 500,00 a R$ 5.000,00
    return String(val);
  }

  function randomSiteUrl(): string {
    const name = Math.random().toString(36).slice(2, 8);
    return `https://www.${name}.com.br`;
  }

  function randomBankCode(): string {
    return pick(['001', '033', '104', '237', '341', '356', '399', '745']);
  }

  function randomAgency(): string {
    return String(randInt(100, 9999));
  }

  function alwaysDigit(): string {
    return String(randInt(0, 9));
  }

  function randomAccount(): string {
    return String(randInt(1000, 999999999999)); // 4 a 12 dígitos aprox.
  }

  function randomAccountType(): 'conta_corrente' | 'conta_poupanca' {
    return pick(['conta_corrente', 'conta_poupanca']);
  }

  function randomAddress() {
    const streets = ['Av. Paulista', 'Rua das Flores', 'Rua da Harmonia', 'Rua Vergueiro', 'Rua Augusta', 'Av. Brasil'];
    const neigh = ['Centro', 'Bela Vista', 'Pinheiros', 'Vila Mariana', 'Moema'];
    const cities = ['São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Curitiba', 'Porto Alegre'];
    const states = ['SP', 'RJ', 'MG', 'PR', 'RS'];
    return {
      street: pick(streets),
      number: String(randInt(10, 5000)),
      comp: pick([
        `Sala ${randInt(1, 1201)}`,
        `Conjunto ${randInt(1, 801)}`,
        `Apto ${randInt(11, 1901)}`,
        `Bloco ${pick(['A','B','C','D'])}, Sala ${randInt(1, 501)}`,
      ]),
      neighborhood: pick(neigh),
      city: pick(cities),
      state: pick(states),
      zip: pad(randInt(1000000, 9999999), 8), // garante 8 dígitos com 0 à esquerda
      ref: Math.random() < 0.5 ? 'Ponto de referência' : 'Em frente à praça',
    };
  }

  function fillWithTestData() {
    const cpf = generateValidCPF();
    const fullName = randomName();
    const mail = randomEmail('pagarme');
    const phone = randomBrazilPhone();
    const birth = randomBirthdate();
    const income = randomMonthlyIncomeCents();
    const occ = randomOccupation();
    const site = randomSiteUrl();
    const mom = randomMotherName();

    const bankCode = randomBankCode();
    const ag = randomAgency();
    const agd = alwaysDigit();
    const acc = randomAccount();
    const accd = alwaysDigit();
    const accType = randomAccountType();

    const addr = randomAddress();

    // Legal
    setName(fullName);
    setDocumentNumber(cpf);
    setEmail(mail);
    setPhone(phone);
    setSiteUrl(site);
    setMotherName(mom);
    setBirthdate(birth);
    setMonthlyIncome(income);
    setOccupation(occ);

    // Bank
    setBank(bankCode);
    setAgency(ag);
    setAgencyDigit(agd);
    setAccount(acc);
    setAccountDigit(accd);
    setAccountType(accType);

    // Address
    setAddrStreet(addr.street);
    setAddrStreetNumber(addr.number);
    setAddrComplementary(addr.comp);
    setAddrNeighborhood(addr.neighborhood);
    setAddrCity(addr.city);
    setAddrState(addr.state);
    setAddrZip(addr.zip);
    setAddrRef(addr.ref);
  }

  async function onSubmit() {
    if (!currentClinic?.id) return toast.error('Selecione um negócio');
    const errorsAll = validateForm();
    if (errorsAll.length) {
      toast.error(errorsAll[0]);
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
      const bankAccount: any = (includeBank && bank && agency && account && accountType) ? {
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
          splitPercent: 85, // 85% para o recipient, 15% para a plataforma/agente
        })
      });
      const data = await res.json().catch(() => undefined);
      if (!res.ok) {
        if (process.env.NODE_ENV !== 'production') {
          // Detailed diagnostics to help identify 4xx/5xx causes in dev
          console.error('[Pagarme Recipient][HTTP Error]', {
            status: res.status,
            statusText: res.statusText,
            response: data,
            request: {
              clinicId: currentClinic.id,
              // Mindful of PII: these are sent to the backend anyway; keep logs only in dev
              legalInfo,
              bankAccount,
            },
          });
        }
        const apiMsg = data?.error || data?.message || data?.details || data?.errors?.[0]?.message;
        throw new Error(`HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''} - ${apiMsg || 'Falha ao configurar recebedor'}`);
      }
      toast.success('Dados salvos. Recipient configurado.');
      router.push('/doctor/integrations');
    } catch (e: any) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[Pagarme Recipient][Exception]', e);
      }
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
              <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Configurar Pagamentos</h1>
              <p className="text-sm text-gray-500">Preencha os dados abaixo para receber repasses. Você pode ajustar o split e a taxa de plataforma.</p>
            </div>
            <div className="flex gap-2">
              {process.env.NODE_ENV !== 'production' && (
                <Button
                  variant="secondary"
                  type="button"
                  onClick={fillWithTestData}
                  className="border border-gray-300"
                >
                  Preencher teste
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  const isBusiness = pathname?.startsWith('/business');
                  router.push(isBusiness ? '/business/integrations' : '/doctor/integrations');
                }}
              >
                Cancelar
              </Button>
              <Button onClick={onSubmit} disabled={saving || step !== 4} className="bg-gray-900 text-white hover:bg-black">{saving ? 'Salvando…' : 'Salvar'}</Button>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Form */}
            <div className="xl:col-span-2">
              <div className="rounded-2xl border border-gray-200 p-5">
                {/* Progress */}
                <div className="flex items-center justify-between mb-4">
                  <div className="text-xs text-gray-600">Etapa {step} de {totalSteps}</div>
                  <div className="flex gap-1">{Array.from({ length: totalSteps }).map((_, i) => (
                    <div key={i} className={`h-1.5 w-8 rounded-full ${i < step ? 'bg-gray-900' : 'bg-gray-200'}`} />
                  ))}</div>
                </div>

                {/* Step 1: Dados pessoais */}
                {step === 1 && (
                  <div>
                    <div className="text-xs font-semibold text-gray-700 mb-3">Dados pessoais</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <div className="text-[12px] text-gray-600 mb-1">Razão social / Nome completo <span className="text-red-500">*</span></div>
                        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Negócio Exemplo LTDA" className="h-10" />
                        {errors.name && <div className="text-[11px] text-red-600 mt-1">{errors.name}</div>}
                      </div>
                      <div>
                        <div className="text-[12px] text-gray-600 mb-1">Documento (CPF/CNPJ) <span className="text-red-500">*</span></div>
                        <Input value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} placeholder="Somente números" className="h-10" />
                        {errors.documentNumber && <div className="text-[11px] text-red-600 mt-1">{errors.documentNumber}</div>}
                      </div>
                      <div>
                        <div className="text-[12px] text-gray-600 mb-1">Email de contato <span className="text-red-500">*</span></div>
                        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@dominio.com" className="h-10" />
                        {errors.email && <div className="text-[11px] text-red-600 mt-1">{errors.email}</div>}
                      </div>
                      <div>
                        <div className="text-[12px] text-gray-600 mb-1">Telefone (E.164) <span className="text-red-500">*</span></div>
                        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+5511999999999" className="h-10" />
                        {errors.phone && <div className="text-[11px] text-red-600 mt-1">{errors.phone}</div>}
                      </div>
                      <div>
                        <div className="text-[12px] text-gray-600 mb-1">Data de nascimento <span className="text-red-500">*</span></div>
                        <Input value={birthdate} onChange={(e) => setBirthdate(e.target.value)} placeholder="dd/mm/aaaa" className="h-10" />
                        {errors.birthdate && <div className="text-[11px] text-red-600 mt-1">{errors.birthdate}</div>}
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 2: Dados profissionais */}
                {step === 2 && (
                  <div>
                    <div className="text-xs font-semibold text-gray-700 mb-3">Dados profissionais</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <div className="text-[12px] text-gray-600 mb-1">Ocupação profissional <span className="text-red-500">*</span></div>
                        <Input value={occupation} onChange={(e) => setOccupation(e.target.value)} placeholder="Dentista" className="h-10" />
                        {errors.occupation && <div className="text-[11px] text-red-600 mt-1">{errors.occupation}</div>}
                      </div>
                      <div>
                        <div className="text-[12px] text-gray-600 mb-1">Renda mensal (R$ centavos) <span className="text-red-500">*</span></div>
                        <Input type="number" value={monthlyIncome} onChange={(e) => setMonthlyIncome(e.target.value)} placeholder="ex.: 120000" className="h-10" />
                        {errors.monthlyIncome && <div className="text-[11px] text-red-600 mt-1">{errors.monthlyIncome}</div>}
                      </div>
                      <div>
                        <div className="text-[12px] text-gray-600 mb-1">Nome da mãe <span className="text-red-500">*</span></div>
                        <Input value={motherName} onChange={(e) => setMotherName(e.target.value)} placeholder="Maria Exemplo" className="h-10" />
                        {errors.motherName && <div className="text-[11px] text-red-600 mt-1">{errors.motherName}</div>}
                      </div>
                      <div>
                        <div className="text-[12px] text-gray-600 mb-1">Site (URL)</div>
                        <Input value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="https://negocio.com" className="h-10" />
                        {errors.siteUrl && <div className="text-[11px] text-red-600 mt-1">{errors.siteUrl}</div>}
                        <div className="text-[11px] text-gray-500 mt-1">Inclua http:// ou https://</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 3: Endereço */}
                {step === 3 && (
                  <div>
                    <div className="text-xs font-semibold text-gray-700 mb-3">Endereço</div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <div className="text-[12px] text-gray-600 mb-1">CEP <span className="text-red-500">*</span></div>
                        <Input value={addrZip} onChange={(e) => setAddrZip(e.target.value)} placeholder="01001000" className="h-10" />
                        {errors.addrZip && <div className="text-[11px] text-red-600 mt-1">{errors.addrZip}</div>}
                        {cepLoading && <div className="text-[11px] text-blue-600 mt-1">Buscando CEP…</div>}
                        {cepError && <div className="text-[11px] text-red-600 mt-1">{cepError}</div>}
                        <div className="text-[11px] text-gray-500 mt-1">Ao digitar 8 dígitos, preenchemos rua, bairro, cidade e UF automaticamente.</div>
                      </div>
                      <div className="md:col-span-2">
                        <div className="text-[12px] text-gray-600 mb-1">Rua <span className="text-red-500">*</span></div>
                        <Input value={addrStreet} onChange={(e) => setAddrStreet(e.target.value)} placeholder="Rua Exemplo" className="h-10" />
                        {errors.addrStreet && <div className="text-[11px] text-red-600 mt-1">{errors.addrStreet}</div>}
                      </div>
                      <div>
                        <div className="text-[12px] text-gray-600 mb-1">Número <span className="text-red-500">*</span></div>
                        <Input ref={streetNumberRef as any} value={addrStreetNumber} onChange={(e) => setAddrStreetNumber(e.target.value)} placeholder="123" className="h-10" />
                        {errors.addrStreetNumber && <div className="text-[11px] text-red-600 mt-1">{errors.addrStreetNumber}</div>}
                      </div>
                      <div>
                        <div className="text-[12px] text-gray-600 mb-1">Complemento</div>
                        <Input value={addrComplementary} onChange={(e) => setAddrComplementary(e.target.value)} placeholder="Sala 1001" className="h-10" />
                      </div>
                      <div>
                        <div className="text-[12px] text-gray-600 mb-1">Bairro <span className="text-red-500">*</span></div>
                        <Input value={addrNeighborhood} onChange={(e) => setAddrNeighborhood(e.target.value)} placeholder="Centro" className="h-10" />
                        {errors.addrNeighborhood && <div className="text-[11px] text-red-600 mt-1">{errors.addrNeighborhood}</div>}
                      </div>
                      <div>
                        <div className="text-[12px] text-gray-600 mb-1">Cidade <span className="text-red-500">*</span></div>
                        <Input value={addrCity} onChange={(e) => setAddrCity(e.target.value)} placeholder="São Paulo" className="h-10" />
                        {errors.addrCity && <div className="text-[11px] text-red-600 mt-1">{errors.addrCity}</div>}
                      </div>
                      <div>
                        <div className="text-[12px] text-gray-600 mb-1">UF <span className="text-red-500">*</span></div>
                        <Input value={addrState} onChange={(e) => setAddrState(e.target.value)} placeholder="SP" className="h-10" />
                        {errors.addrState && <div className="text-[11px] text-red-600 mt-1">{errors.addrState}</div>}
                      </div>
                      <div className="md:col-span-3">
                        <div className="text-[12px] text-gray-600 mb-1">Ponto de referência</div>
                        <Input value={addrRef} onChange={(e) => setAddrRef(e.target.value)} placeholder="Ao lado da praça" className="h-10" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 4: Dados bancários (opcional) */}
                {step === 4 && (
                  <div>
                    <div className="text-xs font-semibold text-gray-700 mb-2">Dados bancários (opcional)</div>
                    <label className="flex items-center gap-2 mb-3 text-sm text-gray-700">
                      <input type="checkbox" checked={includeBank} onChange={(e) => setIncludeBank(e.target.checked)} />
                      Adicionar conta bancária agora
                    </label>
                    {includeBank && (
                      <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                        <div>
                          <div className="text-[12px] text-gray-600 mb-1">Banco <span className="text-red-500">*</span></div>
                          <Input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="341" className="h-10" />
                          {errors.bank && <div className="text-[11px] text-red-600 mt-1">{errors.bank}</div>}
                        </div>
                        <div>
                          <div className="text-[12px] text-gray-600 mb-1">Agência <span className="text-red-500">*</span></div>
                          <Input value={agency} onChange={(e) => setAgency(e.target.value)} placeholder="1234" className="h-10" />
                          {errors.agency && <div className="text-[11px] text-red-600 mt-1">{errors.agency}</div>}
                        </div>
                        <div>
                          <div className="text-[12px] text-gray-600 mb-1">Dígito ag.</div>
                          <Input value={agencyDigit} onChange={(e) => setAgencyDigit(e.target.value)} placeholder="6 (opcional)" className="h-10" />
                        </div>
                        <div>
                          <div className="text-[12px] text-gray-600 mb-1">Conta <span className="text-red-500">*</span></div>
                          <Input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="12345" className="h-10" />
                          {errors.account && <div className="text-[11px] text-red-600 mt-1">{errors.account}</div>}
                        </div>
                        <div>
                          <div className="text-[12px] text-gray-600 mb-1">Dígito conta <span className="text-red-500">*</span></div>
                          <Input value={accountDigit} onChange={(e) => setAccountDigit(e.target.value)} placeholder="6" className="h-10" />
                          {errors.accountDigit && <div className="text-[11px] text-red-600 mt-1">{errors.accountDigit}</div>}
                        </div>
                        <div>
                          <div className="text-[12px] text-gray-600 mb-1">Tipo <span className="text-red-500">*</span></div>
                          <select value={accountType} onChange={(e) => setAccountType(e.target.value as any)} className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm text-gray-900">
                            <option value="" disabled>Selecione</option>
                            <option value="conta_corrente">conta_corrente</option>
                            <option value="conta_poupanca">conta_poupanca</option>
                          </select>
                          {errors.accountType && <div className="text-[11px] text-red-600 mt-1">{errors.accountType}</div>}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Controls */}
                <div className="mt-6 flex items-center justify-between">
                  <div className="text-[11px] text-gray-500">Campos com <span className="text-red-500">*</span> são obrigatórios</div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={goBack} disabled={step === 1}>Voltar</Button>
                    {step < totalSteps && (
                      <Button onClick={goNext}>Próximo</Button>
                    )}
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
