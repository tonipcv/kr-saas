import { NextResponse } from 'next/server';
import { pagarmeGetRecipient, isV5 } from '@/lib/payments/pagarme/sdk';
import { prisma } from '@/lib/prisma';

/**
 * Diagnostic endpoint to validate Pagar.me split configuration
 * Checks: env vars, API version, recipient status and KYC
 * 
 * GET /api/payments/pagarme/config/status?clinic_id=xxx
 * or
 * GET /api/payments/pagarme/config/status (validates only platform recipient)
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const clinicId = searchParams.get('clinic_id') || null;
    const platformRecipientId = process.env.PLATFORM_RECIPIENT_ID || null;
    
    // Fetch clinic recipient from merchants table
    let clinicRecipientId: string | null = null;
    let clinicSplitPercent: number | null = null;
    if (clinicId) {
      try {
        const merchant = await prisma.merchant.findUnique({
          where: { clinicId: String(clinicId) },
          select: { recipientId: true, splitPercent: true, status: true },
        });
        clinicRecipientId = merchant?.recipientId || null;
        clinicSplitPercent = merchant?.splitPercent || null;
        if (!clinicRecipientId) {
          return NextResponse.json({
            error: 'Clinic does not have a recipient configured in merchants table',
            clinic_id: clinicId,
            hint: 'Configure recipient via /doctor/integrations/pagarme/setup',
          }, { status: 400 });
        }
      } catch (e: any) {
        return NextResponse.json({
          error: 'Failed to fetch clinic merchant data',
          message: e?.message || 'Database error',
        }, { status: 500 });
      }
    }

    const checks: any = {
      timestamp: new Date().toISOString(),
      environment: {
        PAGARME_ENABLE_SPLIT: process.env.PAGARME_ENABLE_SPLIT || null,
        PLATFORM_RECIPIENT_ID: platformRecipientId ? '✓ configured' : '✗ missing',
        PAGARME_BASE_URL: process.env.PAGARME_BASE_URL || null,
        PAGARME_API_KEY: process.env.PAGARME_API_KEY ? '✓ configured' : '✗ missing',
        PAGARME_WEBHOOK_SECRET: process.env.PAGARME_WEBHOOK_SECRET ? '✓ configured' : '✗ missing',
      },
      api_version: {
        is_v5: isV5(),
        expected: 'core/v5',
        status: isV5() ? '✓ correct' : '✗ not v5',
      },
      split_enabled: String(process.env.PAGARME_ENABLE_SPLIT || '').toLowerCase() === 'true',
      recipients: {} as any,
      ready_for_production: false,
      issues: [] as string[],
    };

    // Validate API v5
    if (!isV5()) {
      checks.issues.push('PAGARME_BASE_URL must include /core/v5 for split support');
    }

    // Validate split flag
    if (!checks.split_enabled) {
      checks.issues.push('PAGARME_ENABLE_SPLIT is not set to "true"');
    }

    // Validate platform recipient
    if (!platformRecipientId) {
      checks.issues.push('PLATFORM_RECIPIENT_ID is not configured');
    } else {
      try {
        const platformRecipient = await pagarmeGetRecipient(String(platformRecipientId));
        const status = String(platformRecipient?.status || 'unknown').toLowerCase();
        const hasBank = !!(platformRecipient?.default_bank_account || platformRecipient?.bank_account);
        const kycStatus = platformRecipient?.kyc_status || platformRecipient?.register_information?.status || 'unknown';
        
        checks.recipients.platform = {
          id: platformRecipientId,
          status,
          kyc_status: kycStatus,
          has_bank_account: hasBank,
          ready: status === 'active' || status === 'registered',
        };

        if (status !== 'active' && status !== 'registered') {
          checks.issues.push(`Platform recipient status is "${status}" (expected "active" or "registered")`);
        }
        if (!hasBank) {
          checks.issues.push('Platform recipient does not have a default bank account configured');
        }
        if (kycStatus === 'pending' || kycStatus === 'rejected') {
          checks.issues.push(`Platform recipient KYC status is "${kycStatus}"`);
        }
      } catch (e: any) {
        checks.recipients.platform = {
          id: platformRecipientId,
          error: e?.message || 'Failed to fetch recipient',
          ready: false,
        };
        checks.issues.push(`Failed to validate platform recipient: ${e?.message || 'API error'}`);
      }
    }

    // Validate clinic recipient (if provided)
    if (clinicRecipientId) {
      try {
        const clinicRecipient = await pagarmeGetRecipient(String(clinicRecipientId));
        const status = String(clinicRecipient?.status || 'unknown').toLowerCase();
        const hasBank = !!(clinicRecipient?.default_bank_account || clinicRecipient?.bank_account);
        const kycStatus = clinicRecipient?.kyc_status || clinicRecipient?.register_information?.status || 'unknown';
        
        checks.recipients.clinic = {
          id: clinicRecipientId,
          clinic_id: clinicId,
          split_percent: clinicSplitPercent,
          status,
          kyc_status: kycStatus,
          has_bank_account: hasBank,
          ready: status === 'active' || status === 'registered',
        };

        if (status !== 'active' && status !== 'registered') {
          checks.issues.push(`Clinic recipient status is "${status}" (expected "active" or "registered")`);
        }
        if (!hasBank) {
          checks.issues.push('Clinic recipient does not have a default bank account configured');
        }
        if (kycStatus === 'pending' || kycStatus === 'rejected') {
          checks.issues.push(`Clinic recipient KYC status is "${kycStatus}"`);
        }
      } catch (e: any) {
        checks.recipients.clinic = {
          id: clinicRecipientId,
          error: e?.message || 'Failed to fetch recipient',
          ready: false,
        };
        checks.issues.push(`Failed to validate clinic recipient: ${e?.message || 'API error'}`);
      }
    }

    // Overall readiness
    checks.ready_for_production = checks.issues.length === 0;

    if (checks.ready_for_production) {
      checks.message = '✓ All checks passed. Split payments are ready for production.';
    } else {
      checks.message = `✗ ${checks.issues.length} issue(s) found. Fix these before enabling split in production.`;
    }

    // Add recommendations
    checks.recommendations = [
      'Ensure Pix Split and Boleto Split are enabled for both recipients via Pagar.me support',
      'Test all payment methods (card, PIX, boleto) in sandbox before production',
      'Monitor webhook logs for split application on subscription charges (charge.created events)',
      'Verify split rules appear in Pagar.me dashboard after test transactions',
    ];

    return NextResponse.json(checks, { status: checks.ready_for_production ? 200 : 424 });
  } catch (e: any) {
    return NextResponse.json({
      error: 'Failed to validate Pagar.me configuration',
      message: e?.message || 'Unknown error',
    }, { status: 500 });
  }
}
