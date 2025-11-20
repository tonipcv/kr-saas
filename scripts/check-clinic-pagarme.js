/*
 Check Pagar.me integration readiness for a clinic by owner email or clinic ID.

 Usage examples:
   node scripts/check-clinic-pagarme.js --email xppveronica@gmail.com
   node scripts/check-clinic-pagarme.js --clinicId <uuid>

 Requires env:
   DATABASE_URL
   PAGARME_API_KEY
   PAGARME_BASE_URL (should include /core/v5)
   PLATFORM_RECIPIENT_ID
   PAGARME_ENABLE_SPLIT=true
   Optional: PAGARME_AUTH_SCHEME (basic|bearer), PAGARME_ACCOUNT_ID
*/

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--email') out.email = args[++i];
    else if (a === '--clinicId') out.clinicId = args[++i];
  }
  return out;
}

function authHeaders() {
  const apiKey = process.env.PAGARME_API_KEY || '';
  const scheme = (process.env.PAGARME_AUTH_SCHEME || 'basic').toLowerCase();
  const accountId = process.env.PAGARME_ACCOUNT_ID || '';
  if (scheme === 'bearer') {
    const h = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
    if (accountId) h['X-PagarMe-Account-Id'] = accountId;
    return h;
  }
  const token = Buffer.from(`${apiKey}:`).toString('base64');
  const h = {
    Authorization: `Basic ${token}`,
    'Content-Type': 'application/json',
  };
  if (accountId) h['X-PagarMe-Account-Id'] = accountId;
  return h;
}

async function getRecipient(recipientId) {
  const base = process.env.PAGARME_BASE_URL || '';
  if (!base) throw new Error('PAGARME_BASE_URL not set');
  const url = `${base}/recipients/${encodeURIComponent(recipientId)}`;
  const res = await fetch(url, { method: 'GET', headers: authHeaders() });
  const text = await res.text();
  let data = {};
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) throw new Error(`[Pagar.me ${res.status}] ${data?.message || data?.error || text}`);
  return data;
}

function ok(x) { return x ? '✓' : '✗'; }

async function run() {
  const { email, clinicId } = parseArgs();
  if (!email && !clinicId) {
    console.error('Usage: node scripts/check-clinic-pagarme.js --email <ownerEmail> | --clinicId <uuid>');
    process.exit(1);
  }

  console.log('--- Integration Readiness Check ---');
  console.log('Time:', new Date().toISOString());

  // Env checks
  const ENV = {
    PAGARME_BASE_URL: process.env.PAGARME_BASE_URL || null,
    PAGARME_API_KEY: process.env.PAGARME_API_KEY ? 'set' : 'missing',
    PLATFORM_RECIPIENT_ID: process.env.PLATFORM_RECIPIENT_ID || null,
    PAGARME_ENABLE_SPLIT: process.env.PAGARME_ENABLE_SPLIT || null,
  };
  const isV5 = (ENV.PAGARME_BASE_URL || '').includes('/core/v5');

  console.log('\n[Environment]');
  console.log(' - BASE_URL:', ENV.PAGARME_BASE_URL);
  console.log(' - API_KEY:', ENV.PAGARME_API_KEY);
  console.log(' - PLATFORM_RECIPIENT_ID:', ENV.PLATFORM_RECIPIENT_ID ? 'set' : 'missing');
  console.log(' - ENABLE_SPLIT:', ENV.PAGARME_ENABLE_SPLIT);
  console.log(' - API version v5:', ok(isV5));

  // Resolve clinic
  let clinic = null;
  if (clinicId) {
    clinic = await prisma.clinic.findUnique({
      where: { id: String(clinicId) },
      include: { merchant: true, owner: true }
    });
  } else {
    const user = await prisma.user.findUnique({ where: { email: String(email) }, select: { id: true, email: true, name: true } });
    if (!user) throw new Error(`User not found: ${email}`);
    clinic = await prisma.clinic.findFirst({ where: { ownerId: user.id }, include: { merchant: true, owner: true } });
  }

  if (!clinic) throw new Error('Clinic not found');

  console.log('\n[Clinic]');
  console.log(' - id:', clinic.id);
  console.log(' - name:', clinic.name);
  console.log(' - owner:', clinic?.owner?.email);
  console.log(' - isActive:', clinic.isActive);

  const merchant = clinic.merchant || null;
  console.log('\n[Merchant]');
  console.log(' - recipientId:', merchant?.recipientId || null);
  console.log(' - status:', merchant?.status || null);
  console.log(' - splitPercent:', merchant?.splitPercent ?? null);
  console.log(' - platformFeeBps:', merchant?.platformFeeBps ?? null);
  console.log(' - lastSyncAt:', merchant?.lastSyncAt || null);

  const issues = [];
  if (!isV5) issues.push('PAGARME_BASE_URL must include /core/v5');
  if (String(ENV.PAGARME_ENABLE_SPLIT || '').toLowerCase() !== 'true') issues.push('PAGARME_ENABLE_SPLIT is not "true"');
  if (!ENV.PLATFORM_RECIPIENT_ID) issues.push('PLATFORM_RECIPIENT_ID not configured');

  // Platform recipient check
  let platform = null;
  if (ENV.PLATFORM_RECIPIENT_ID) {
    try {
      platform = await getRecipient(String(ENV.PLATFORM_RECIPIENT_ID));
      const status = String(platform?.status || 'unknown').toLowerCase();
      const hasBank = !!(platform?.default_bank_account || platform?.bank_account);
      const kyc = platform?.kyc_status || platform?.register_information?.status || 'unknown';
      console.log('\n[Platform Recipient]');
      console.log(' - status:', status);
      console.log(' - has_bank_account:', hasBank);
      console.log(' - kyc_status:', kyc);
      if (!['active', 'registered'].includes(status)) issues.push(`Platform recipient status is ${status}`);
      if (!hasBank) issues.push('Platform recipient missing default bank account');
      if (['pending', 'rejected'].includes(String(kyc))) issues.push(`Platform recipient KYC is ${kyc}`);
    } catch (e) {
      issues.push(`Failed to fetch platform recipient: ${(e && e.message) || e}`);
    }
  }

  // Clinic recipient check
  let clinicRec = null;
  if (!merchant?.recipientId) {
    issues.push('Clinic does not have a recipientId in merchants table');
  } else {
    try {
      clinicRec = await getRecipient(String(merchant.recipientId));
      const status = String(clinicRec?.status || 'unknown').toLowerCase();
      const hasBank = !!(clinicRec?.default_bank_account || clinicRec?.bank_account);
      const kyc = clinicRec?.kyc_status || clinicRec?.register_information?.status || 'unknown';
      console.log('\n[Clinic Recipient]');
      console.log(' - id:', merchant.recipientId);
      console.log(' - status:', status);
      console.log(' - has_bank_account:', hasBank);
      console.log(' - kyc_status:', kyc);
      if (!['active', 'registered'].includes(status)) issues.push(`Clinic recipient status is ${status}`);
      if (!hasBank) issues.push('Clinic recipient missing default bank account');
      if (['pending', 'rejected'].includes(String(kyc))) issues.push(`Clinic recipient KYC is ${kyc}`);
    } catch (e) {
      issues.push(`Failed to fetch clinic recipient: ${(e && e.message) || e}`);
    }
  }

  const ready = issues.length === 0;
  console.log('\n[Summary]');
  console.log(' - ready_for_production:', ready ? 'YES' : 'NO');
  if (!ready) {
    console.log(' - issues:');
    for (const i of issues) console.log(`   * ${i}`);
  }

  await prisma.$disconnect();
  process.exit(ready ? 0 : 2);
}

run().catch(async (e) => {
  try { console.error(e); } catch {}
  try { await prisma.$disconnect(); } catch {}
  process.exit(1);
});
