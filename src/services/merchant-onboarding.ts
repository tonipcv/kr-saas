import { prisma } from '@/lib/prisma';
import { pagarmeCreateRecipient, pagarmeUpdateRecipient, isV5 } from '@/lib/pagarme';

export type MerchantApplicationPayload = {
  clinicId: string;
  type?: 'INDIVIDUAL' | 'COMPANY';
  businessName?: string | null;
  fullName?: string | null;
  documentNumber?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: Record<string, any> | null;
  bankAccount?: Record<string, any> | null;
};

export class MerchantOnboardingService {
  // Upsert draft/application per clinic, idempotent by clinicId unique
  async saveDraft(payload: MerchantApplicationPayload) {
    const {
      clinicId,
      type = 'INDIVIDUAL',
      businessName = null,
      fullName = null,
      documentNumber = null,
      email = null,
      phone = null,
      address = null,
      bankAccount = null,
    } = payload;

    if (!clinicId) throw new Error('clinicId is required');

    // Minimal normalization
    const normEmail = email ? String(email).trim().toLowerCase() : null;
    const normDoc = documentNumber ? String(documentNumber).replace(/\D+/g, '') : null;

    // Upsert by clinicId
    const app = await prisma.merchantApplication.upsert({
      where: { clinicId },
      update: {
        type: type as any,
        businessName,
        fullName,
        documentNumber: normDoc,
        email: normEmail,
        phone,
        address: (address ?? undefined) as any,
        bankAccount: (bankAccount ?? undefined) as any,
        // Status progression: if estava DRAFT e passou dados, vai para PENDING_DOCUMENTS
        status: 'PENDING_DOCUMENTS' as any,
        updatedAt: new Date(),
      },
      create: {
        clinicId,
        type: type as any,
        businessName,
        fullName,
        documentNumber: normDoc,
        email: normEmail,
        phone,
        address: (address ?? undefined) as any,
        bankAccount: (bankAccount ?? undefined) as any,
        status: 'PENDING_DOCUMENTS' as any,
      },
    });

    return app;
  }

  // Register a document for the clinic application. Idempotent by (applicationId, fileUrl)
  async addDocument(params: { clinicId: string; type: 'ID_FRONT' | 'ID_BACK' | 'SELFIE' | 'CNPJ_CARD' | 'ADDRESS_PROOF' | 'CONTRACT_SOCIAL' | 'BANK_STATEMENT' | 'OTHER'; fileUrl: string; notes?: string | null; }) {
    const { clinicId, type, fileUrl, notes = null } = params;
    if (!clinicId) throw new Error('clinicId is required');
    if (!fileUrl) throw new Error('fileUrl is required');

    // Resolve (or create) the application row first to get its id
    const app = await prisma.merchantApplication.upsert({
      where: { clinicId },
      update: {},
      create: { clinicId, status: 'PENDING_DOCUMENTS' as any, type: 'INDIVIDUAL' as any },
      select: { id: true }
    });

    // Idempotent: check if same fileUrl already exists for this application
    const existing = await prisma.merchantDocument.findFirst({
      where: { applicationId: app.id, fileUrl },
    });
    if (existing) return existing;

    const doc = await prisma.merchantDocument.create({
      data: {
        applicationId: app.id,
        type: type as any,
        fileUrl,
        notes: notes ?? undefined,
        status: 'PENDING' as any,
      }
    });
    return doc;
  }

  // Validate minimum fields and set status to UNDER_REVIEW
  async submitApplication(params: { clinicId: string }) {
    const { clinicId } = params;
    if (!clinicId) throw new Error('clinicId is required');

    const app = await prisma.merchantApplication.findUnique({ where: { clinicId } });
    if (!app) throw new Error('Application not found');

    // Minimal required fields (business rules can evolve):
    const hasType = !!app.type;
    const hasDoc = !!app.documentNumber && app.documentNumber.trim().length >= 11;
    const hasEmail = !!app.email;
    const hasPhone = !!app.phone;
    const hasAddress = !!app.address;
    const hasBank = !!app.bankAccount;

    if (!(hasType && hasDoc && hasEmail && hasPhone && hasAddress && hasBank)) {
      return { success: false, status: app.status, message: 'Missing required fields to submit' };
    }

    // Only allow transition from DRAFT/PENDING_DOCUMENTS to UNDER_REVIEW
    if (app.status === 'UNDER_REVIEW' || app.status === 'APPROVED') {
      return { success: true, status: app.status, message: 'Already submitted' };
    }

    const updated = await prisma.merchantApplication.update({
      where: { clinicId },
      data: { status: 'UNDER_REVIEW' as any }
    });
    return { success: true, status: updated.status };
  }

  // Admin: approve application, create/update recipient and Merchant, set owner accessGranted=true
  async approveApplication(params: { applicationId: string; reviewedBy: string }) {
    const { applicationId, reviewedBy } = params;
    if (!applicationId) throw new Error('applicationId is required');

    const app = await prisma.merchantApplication.findUnique({
      where: { id: applicationId },
      include: { clinic: { select: { id: true, ownerId: true } } },
    });
    if (!app) throw new Error('Application not found');

    // If already approved, be idempotent: ensure Merchant exists and owner access
    const clinicId = app.clinicId;

    // Minimal recipient payload based on PF/PJ
    const isCompany = app.type === 'COMPANY';
    const address: any = app.address || {};
    const bank: any = app.bankAccount || {};

    const base: any = isV5()
      ? {
          name: isCompany ? app.businessName : app.fullName,
          email: app.email,
          document: app.documentNumber,
          type: isCompany ? 'company' : 'individual',
          // v5 bank account payload example (simplified)
          default_bank_account: bank ? {
            bank: bank.bankCode,
            branch_number: bank.agency,
            account_number: bank.account,
            holder_name: bank.legalName || (isCompany ? app.businessName : app.fullName),
            holder_document: bank.documentNumber || app.documentNumber,
            type: bank.type || 'checking',
          } : undefined,
          // address (simplified)
          address: address ? {
            line_1: `${address.street || ''}, ${address.number || ''}`.trim(),
            zip_code: address.cep || address.zip || undefined,
            city: address.city,
            state: address.state,
            country: address.country || 'BR',
          } : undefined,
        }
      : {
          bank_account: bank ? {
            bank_code: bank.bankCode,
            agencia: bank.agency,
            conta: bank.account,
            legal_name: bank.legalName || (isCompany ? app.businessName : app.fullName),
            document_number: bank.documentNumber || app.documentNumber,
            type: bank.type || 'conta_corrente',
          } : undefined,
          transfer_enabled: true,
          transfer_interval: 'monthly',
          transfer_day: 1,
          automatic_anticipation_enabled: false,
        };

    // Determine recipientId precedence: application.recipientId or existing merchant.recipientId
    const existingMerchant = await prisma.merchant.findUnique({ where: { clinicId } }).catch(async () => {
      return prisma.merchant.findFirst({ where: { clinicId } });
    });
    const currentRecipientId = app.recipientId || existingMerchant?.recipientId || null;

    let recipient: any = null;
    if (currentRecipientId) {
      // Update existing recipient
      recipient = await pagarmeUpdateRecipient(currentRecipientId, base).catch(() => null);
    } else {
      // Create new recipient
      recipient = await pagarmeCreateRecipient(base);
    }
    const recipientId: string | null = (recipient && (recipient.id || recipient?.data?.id)) || currentRecipientId;

    // Upsert Merchant for clinic
    if (existingMerchant) {
      await prisma.merchant.update({
        where: { id: existingMerchant.id },
        data: { status: 'ACTIVE' as any, recipientId: recipientId || existingMerchant.recipientId },
      });
    } else {
      await prisma.merchant.create({
        data: {
          clinicId,
          status: 'ACTIVE' as any,
          recipientId: recipientId || undefined,
        },
      });
    }

    // Update application status/recipient and review fields
    await prisma.merchantApplication.update({
      where: { id: app.id },
      data: {
        status: 'APPROVED' as any,
        recipientId: recipientId || app.recipientId,
        reviewedBy,
        reviewedAt: new Date(),
      },
    });

    // Grant access to clinic owner
    if (app.clinic?.ownerId) {
      await prisma.user.update({
        where: { id: app.clinic.ownerId },
        data: { accessGranted: true as any },
      }).catch(() => null);
    }

    return { success: true, recipientId: recipientId || null };
  }

  // Admin: reject application
  async rejectApplication(params: { applicationId: string; reviewedBy: string; reviewNotes?: string | null }) {
    const { applicationId, reviewedBy, reviewNotes = null } = params;
    if (!applicationId) throw new Error('applicationId is required');

    const app = await prisma.merchantApplication.findUnique({ where: { id: applicationId } });
    if (!app) throw new Error('Application not found');

    if (app.status === 'APPROVED' || app.status === 'REJECTED') {
      return { success: true, status: app.status };
    }

    const updated = await prisma.merchantApplication.update({
      where: { id: applicationId },
      data: { status: 'REJECTED' as any, reviewNotes: reviewNotes ?? undefined, reviewedBy, reviewedAt: new Date() },
    });
    return { success: true, status: updated.status };
  }
}
