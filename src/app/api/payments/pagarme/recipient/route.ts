import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { pagarmeCreateBankAccount, pagarmeCreateRecipient, pagarmeGetRecipient, pagarmeUpdateRecipient, isV5 } from '@/lib/payments/pagarme/sdk';

// Create or update recipient for a clinic
// Body: { clinicId, legalInfo, bankAccount, splitPercent?, platformFeeBps? }
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const isDev = process.env.NODE_ENV !== 'production';
    if (!session?.user?.id) {
      if (isDev) {
        console.warn('[pagarme][recipient] 401 - no session');
      }
      return NextResponse.json({ error: 'Não autorizado', ...(isDev ? { details: { reason: 'no_session' } } : {}) }, { status: 401 });
    }
    const { clinicId, legalInfo, bankAccount, splitPercent, platformFeeBps, transactionFeeCents, transactionFeeType } = await req.json();
    if (!clinicId) return NextResponse.json({ error: 'clinicId é obrigatório' }, { status: 400 });

    // Identify SUPER_ADMIN to allow bypassing clinic membership checks
    const dbUser = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true, email: true } });
    const isSuperAdmin = dbUser?.role === 'SUPER_ADMIN';

    // Ensure the user is authorized for the clinic except SUPER_ADMIN users
    if (!isSuperAdmin) {
      // If the user owns the clinic but doesn't yet have a ClinicMember row, create it automatically (root-cause fix).
      let clinicMember = await prisma.clinicMember.findFirst({ where: { clinicId, userId: session.user.id } });
      if (!clinicMember) {
        const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { id: true, ownerId: true } });
        if (clinic?.ownerId === session.user.id) {
          // Auto-create membership for owner
          try {
            clinicMember = await prisma.clinicMember.upsert({
              where: { clinicId_userId: { clinicId, userId: session.user.id } },
              create: { clinicId, userId: session.user.id, role: 'OWNER' },
              update: {},
            });
            if (isDev) {
              console.warn('[pagarme][recipient] Auto-created ClinicMember for owner', { userId: session.user.id, clinicId });
            }
          } catch (err) {
            if (isDev) console.warn('[pagarme][recipient] Failed to auto-create owner membership', err);
          }
        }
      }
      if (!clinicMember) {
        if (isDev) {
          console.warn('[pagarme][recipient] 403 - user is not member of clinic', { userId: session.user.id, clinicId });
        }
        return NextResponse.json({ error: 'Não autorizado para esta clínica', ...(isDev ? { details: { userId: session.user.id, clinicId } } : {}) }, { status: 403 });
      }
    } else if (isDev) {
      console.warn('[pagarme][recipient] SUPER_ADMIN bypassing clinic membership', { email: dbUser?.email, clinicId });
    }

    // Ensure Merchant row exists
    const merchant = await prisma.merchant.upsert({
      where: { clinicId },
      update: {},
      create: { clinicId, status: 'PENDING' },
      select: { recipientId: true, externalAccountId: true, splitPercent: true, platformFeeBps: true },
    });

    let externalAccountId = merchant.externalAccountId || null;
    const useV5 = isV5();
    const feeOnlyUpdate = (!legalInfo || Object.keys(legalInfo || {}).length === 0) && (!bankAccount || Object.keys(bankAccount || {}).length === 0);
    if (!useV5 && !feeOnlyUpdate && bankAccount && Object.keys(bankAccount).length > 0) {
      // v1 flow: create bank account resource first
      try {
        const ba = await pagarmeCreateBankAccount(bankAccount);
        externalAccountId = ba?.id || ba?.bank_account?.id || ba?.bank_account_id || null;
      } catch (err: any) {
        console.warn('[pagarme][recipient] bank_account creation failed on v1, continuing without bank account:', err?.message || err);
        externalAccountId = null;
      }
    }

    // Helper: deep prune undefined, null, empty string and empty objects/arrays
    const prune = (v: any): any => {
      if (Array.isArray(v)) {
        const arr = v.map(prune).filter((x) => !(x === undefined || x === null || (typeof x === 'string' && x.trim() === '') || (typeof x === 'object' && x && Object.keys(x).length === 0)));
        return arr.length ? arr : undefined;
      }
      if (v && typeof v === 'object') {
        const out: any = {};
        for (const [k, val] of Object.entries(v)) {
          const pv = prune(val);
          if (pv !== undefined) out[k] = pv;
        }
        return Object.keys(out).length ? out : undefined;
      }
      if (v === undefined || v === null) return undefined;
      if (typeof v === 'string' && v.trim() === '') return undefined;
      return v;
    };

    let recipPayload: any;
    if (!feeOnlyUpdate && useV5) {
      // v5 core payload (working schema)
      const docStr: string = String(legalInfo?.document_number ?? legalInfo?.document ?? '');
      const digitsDoc = docStr.replace(/\D/g, '');
      if (!(digitsDoc.length === 11 || digitsDoc.length === 14)) {
        throw new Error('Documento inválido: informe CPF (11 dígitos) ou CNPJ (14 dígitos)');
      }
      const personType = digitsDoc.length > 11 ? 'company' : 'individual';

      // Parse phone to Pagar.me phone_numbers format
      const rawPhone = (legalInfo?.phone_number || '').toString().trim();
      let phone_numbers: any[] | undefined = undefined;
      if (rawPhone) {
        let digits = rawPhone.replace(/\D/g, '');
        // Normalize country code without '+' (e.g., 55...)
        if (!rawPhone.startsWith('+') && digits.startsWith('55') && digits.length >= 12) {
          digits = digits.slice(2); // drop country code
        }
        // Heuristics for BR numbers
        if (rawPhone.startsWith('+') && digits.length >= 6) {
          const area_code = digits.slice(2, 4);
          const number = digits.slice(4);
          phone_numbers = [{ ddd: area_code, number, type: 'mobile' }];
        } else if (digits.length >= 10) {
          // e.g., 11999999999 or 1133334444 (after country code normalization)
          const area_code = digits.slice(0, 2);
          const number = digits.slice(2);
          phone_numbers = [{ ddd: area_code, number, type: 'mobile' }];
        }
      }

      const bankTypeMap: Record<string, 'checking' | 'savings'> = {
        'conta_corrente': 'checking',
        'conta_poupanca': 'savings',
      } as const;
      const normalizedBankType = bankTypeMap[bankAccount?.type] || 'checking';

      const defaultBankRaw: any = (bankAccount && Object.keys(bankAccount).length > 0) ? {
        holder_name: legalInfo?.name || undefined,
        holder_type: personType,
        holder_document: digitsDoc || undefined,
        bank: bankAccount.bank_code || bankAccount.bank || undefined,
        branch_number: bankAccount.agencia || bankAccount.branch_number || undefined,
        branch_check_digit: bankAccount.branch_check_digit || undefined,
        account_number: (bankAccount.conta || bankAccount.account_number || '').toString().replace(/[^0-9]/g, ''),
        // Pagar.me v5 requires account_check_digit; use '0' as fallback if not provided
        account_check_digit: (bankAccount.account_check_digit || '').toString().trim() || '0',
        type: normalizedBankType,
      } : undefined;
      const defaultBank = prune(defaultBankRaw);

      // Allow client to send a full register_information block
      const ri = legalInfo?.register_information || {};
      // Normalize site_url: must include http/https according to Pagar.me validation
      const rawSiteUrl: string | undefined = (ri.site_url || legalInfo?.site_url || '').toString().trim() || undefined;
      const normalizedSiteUrl = rawSiteUrl && !/^https?:\/\//i.test(rawSiteUrl) ? `https://${rawSiteUrl}` : rawSiteUrl;
      const ts = legalInfo?.transfer_settings || {};
      const address = ri.address || {};
      const providedPhones = Array.isArray(ri.phone_numbers) ? ri.phone_numbers : undefined;

      // Build register_information. Force type to personType and normalize document fields.
      let register_information = prune({
        name: ri.name ?? legalInfo?.name,
        email: ri.email ?? legalInfo?.email,
        document: digitsDoc || undefined,
        document_number: digitsDoc || undefined,
        type: personType,
        site_url: normalizedSiteUrl,
        mother_name: ri.mother_name,
        birthdate: ri.birthdate,
        monthly_income: ri.monthly_income,
        professional_occupation: ri.professional_occupation,
        address: prune({
          street: address.street,
          complementary: address.complementary,
          street_number: address.street_number,
          neighborhood: address.neighborhood,
          city: address.city,
          state: address.state,
          zip_code: address.zip_code,
          reference_point: address.reference_point,
        }),
        phone_numbers: providedPhones || phone_numbers,
      });

      // Mandatory defaults for individual
      if ((register_information as any)?.type === 'individual') {
        const riEnsured: any = { ...(register_information as any) };
        if (!riEnsured.birthdate) riEnsured.birthdate = '01/01/1990'; // dd/mm/yyyy
        if (!riEnsured.monthly_income) riEnsured.monthly_income = 120000; // example default
        if (!riEnsured.professional_occupation) riEnsured.professional_occupation = 'Profissional de Saude';
        const addr = riEnsured.address || {};
        riEnsured.address = {
          street: addr.street || 'Rua Desconhecida',
          complementary: addr.complementary,
          street_number: addr.street_number || 'S/N',
          neighborhood: addr.neighborhood || 'Centro',
          city: addr.city || 'Sao Paulo',
          state: addr.state || 'SP',
          zip_code: addr.zip_code || '01000000',
          reference_point: addr.reference_point,
        };
        register_information = prune(riEnsured);
      }

      const transfer_settings = prune({
        transfer_enabled: typeof ts.transfer_enabled === 'boolean' ? ts.transfer_enabled : false,
        transfer_interval: ts.transfer_interval ?? 'Daily',
        transfer_day: typeof ts.transfer_day === 'number' ? ts.transfer_day : 0,
      });

      recipPayload = prune({
        code: legalInfo?.code || `clinic-${clinicId}`,
        register_information,
        transfer_settings,
        default_bank_account: defaultBank,
      });
    } else if (!feeOnlyUpdate) {
      // v1 payload
      recipPayload = {
        transfer_enabled: true,
        automatic_anticipation_enabled: false,
      };
      if (externalAccountId) recipPayload.bank_account_id = externalAccountId;
      if (legalInfo && typeof legalInfo === 'object') Object.assign(recipPayload, legalInfo);
    }

    let recipientId = merchant.recipientId || null;
    if (!feeOnlyUpdate) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[pagarme][recipient] Payload (v5:', useV5, ')', JSON.stringify(recipPayload));
      }
      if (recipientId) {
        try {
          const upd = await pagarmeUpdateRecipient(recipientId, recipPayload);
          recipientId = upd?.id || upd?.recipient_id || recipientId;
        } catch (err: any) {
          // If remote recipient does not exist anymore, create a new one
          if (err?.status === 404) {
            try {
              const created = await pagarmeCreateRecipient(recipPayload);
              recipientId = created?.id || created?.recipient_id || null;
            } catch (ce: any) {
              // Handle duplicate external_id/code (412) by regenerating code once
              if (ce?.status === 412) {
                const orig = recipPayload?.code || `clinic-${clinicId}`;
                recipPayload.code = `${orig}-${Math.random().toString(36).slice(2, 8)}`;
                const created2 = await pagarmeCreateRecipient(recipPayload);
                recipientId = created2?.id || created2?.recipient_id || null;
              } else {
                throw ce;
              }
            }
          } else {
            throw err;
          }
        }
      } else {
        try {
          const created = await pagarmeCreateRecipient(recipPayload);
          recipientId = created?.id || created?.recipient_id || null;
        } catch (ce: any) {
          if (ce?.status === 412) {
            const orig = recipPayload?.code || `clinic-${clinicId}`;
            recipPayload.code = `${orig}-${Math.random().toString(36).slice(2, 8)}`;
            const created2 = await pagarmeCreateRecipient(recipPayload);
            recipientId = created2?.id || created2?.recipient_id || null;
          } else {
            throw ce;
          }
        }
      }
    }

    // Basic guards
    const txFeeCents = typeof transactionFeeCents === 'number' ? Math.max(0, Math.floor(transactionFeeCents)) : undefined;
    const txFeeType = typeof transactionFeeType === 'string' ? String(transactionFeeType) : undefined;

    const updated = await prisma.merchant.update({
      where: { clinicId },
      data: {
        recipientId,
        externalAccountId,
        splitPercent: typeof splitPercent === 'number' ? splitPercent : merchant.splitPercent,
        platformFeeBps: typeof platformFeeBps === 'number' ? platformFeeBps : merchant.platformFeeBps,
        transactionFeeCents: txFeeCents !== undefined ? txFeeCents : merchant.transactionFeeCents,
        transactionFeeType: txFeeType || merchant.transactionFeeType,
        status: recipientId ? 'ACTIVE' : 'PENDING',
        lastSyncAt: new Date(),
      }
    });

    return NextResponse.json({ success: true, merchant: updated, hint: externalAccountId ? undefined : 'Conta bancária não vinculada. Verifique versão da API (PAGARME_BASE_URL) e payload.' });
  } catch (e: any) {
    // Log full diagnostic when available
    const diag = {
      message: e?.message,
      status: e?.status,
      responseJson: e?.responseJson,
      responseText: e?.responseText,
      stack: e?.stack,
    };
    console.error('[pagarme][recipient] error', diag);
    return NextResponse.json({
      error: e?.message || 'Erro interno do servidor',
      status: e?.status || 500,
      pagarme: e?.responseJson || undefined,
      raw: !e?.responseJson ? e?.responseText : undefined,
    }, { status: 500 });
  }
}
