import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { pagarmeCreateBankAccount, pagarmeCreateRecipient, pagarmeGetRecipient, pagarmeUpdateRecipient, isV5 } from '@/lib/pagarme';

// Create or update recipient for a clinic
// Body: { clinicId, legalInfo, bankAccount, splitPercent?, platformFeeBps? }
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    const { clinicId, legalInfo, bankAccount, splitPercent, platformFeeBps } = await req.json();
    if (!clinicId) return NextResponse.json({ error: 'clinicId é obrigatório' }, { status: 400 });

    const clinicMember = await prisma.clinicMember.findFirst({ where: { clinicId, userId: session.user.id, isActive: true } });
    if (!clinicMember) return NextResponse.json({ error: 'Não autorizado para esta clínica' }, { status: 403 });

    // Ensure Merchant row exists
    const merchant = await prisma.merchant.upsert({
      where: { clinicId },
      update: {},
      create: { clinicId, status: 'PENDING' },
      select: { recipientId: true, externalAccountId: true, splitPercent: true, platformFeeBps: true },
    });

    let externalAccountId = merchant.externalAccountId || null;
    const useV5 = isV5();
    if (!useV5 && bankAccount && Object.keys(bankAccount).length > 0) {
      // v1 flow: create bank account resource first
      try {
        const ba = await pagarmeCreateBankAccount(bankAccount);
        externalAccountId = ba?.id || ba?.bank_account?.id || ba?.bank_account_id || null;
      } catch (err: any) {
        console.warn('[pagarme][recipient] bank_account creation failed on v1, continuing without bank account:', err?.message || err);
        externalAccountId = null;
      }
    }

    let recipPayload: any;
    if (useV5) {
      // v5 core payload
      const doc: string | undefined = legalInfo?.document_number || legalInfo?.document || undefined;
      const personType = doc && doc.replace(/\D/g, '').length > 11 ? 'company' : 'individual';
      const defaultBank: any = (bankAccount && Object.keys(bankAccount).length > 0) ? {
        holder_name: legalInfo?.name || undefined,
        holder_type: personType,
        bank: bankAccount.bank_code || bankAccount.bank || undefined,
        branch_number: bankAccount.agencia || bankAccount.branch_number || undefined,
        account_number: (bankAccount.conta || bankAccount.account_number || '').toString().replace(/[^0-9]/g, ''),
        account_check_digit: bankAccount.account_check_digit || undefined,
        type: bankAccount.type || 'checking',
      } : undefined;
      recipPayload = {
        name: legalInfo?.name,
        email: legalInfo?.email,
        document: doc,
        type: personType,
        phone: legalInfo?.phone_number || undefined,
        default_bank_account: defaultBank,
      };
    } else {
      // v1 payload
      recipPayload = {
        transfer_enabled: true,
        automatic_anticipation_enabled: false,
      };
      if (externalAccountId) recipPayload.bank_account_id = externalAccountId;
      if (legalInfo && typeof legalInfo === 'object') Object.assign(recipPayload, legalInfo);
    }

    let recipientId = merchant.recipientId || null;
    if (recipientId) {
      const upd = await pagarmeUpdateRecipient(recipientId, recipPayload);
      recipientId = upd?.id || upd?.recipient_id || recipientId;
    } else {
      const created = await pagarmeCreateRecipient(recipPayload);
      recipientId = created?.id || created?.recipient_id || null;
    }

    const updated = await prisma.merchant.update({
      where: { clinicId },
      data: {
        recipientId,
        externalAccountId,
        splitPercent: typeof splitPercent === 'number' ? splitPercent : merchant.splitPercent,
        platformFeeBps: typeof platformFeeBps === 'number' ? platformFeeBps : merchant.platformFeeBps,
        status: recipientId ? 'ACTIVE' : 'PENDING',
        lastSyncAt: new Date(),
      }
    });

    return NextResponse.json({ success: true, merchant: updated, hint: externalAccountId ? undefined : 'Conta bancária não vinculada. Verifique versão da API (PAGARME_BASE_URL) e payload.' });
  } catch (e: any) {
    console.error('[pagarme][recipient] error', e);
    return NextResponse.json({ error: e?.message || 'Erro interno do servidor' }, { status: 500 });
  }
}
