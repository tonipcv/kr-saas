#!/usr/bin/env node
/*
  Set Merchant.recipientId for a clinic.

  Usage examples:
    node scripts/set-merchant-recipient.js --clinic <CLINIC_ID> --recipient re_xxx
    node scripts/set-merchant-recipient.js --clinic <CLINIC_ID> --recipient re_xxx --dry-run
    node scripts/set-merchant-recipient.js --clinic <CLINIC_ID> --recipient re_xxx --no-verify

  Flags:
    --clinic <ID>         Clinic ID to update
    --email <EMAIL>       Clinic email to resolve the clinic (alternative to --clinic)
    --recipient <re_..>   New recipient id (required, must start with re_)
    --status <STATUS>     Optional Merchant.status to set (default: ACTIVE)
    --dry-run             Do not write; only print what would change
    --no-verify           Skip verification against Pagar.me API
    --slug <SLUG>         Clinic slug to resolve the clinic (alternative to --clinic/--email)

  Auth for verification:
    - Set PAGARME_BASIC_AUTH with Base64 of "API_KEY:" (recommended)
    - Or set PAGARME_API_KEY (the script will build Basic automatically)
    - Optionally set PAGARME_BASE_URL (default: https://api.pagar.me/core/v5)
*/

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

function parseArgs(argv) {
  const out = { clinic: null, email: null, slug: null, recipient: null, dryRun: false, verify: true, status: 'ACTIVE' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--clinic') { out.clinic = argv[++i]; continue; }
    if (a === '--email') { out.email = argv[++i]; continue; }
    if (a === '--slug') { out.slug = argv[++i]; continue; }
    if (a === '--recipient') { out.recipient = argv[++i]; continue; }
    if (a === '--dry-run') { out.dryRun = true; continue; }
    if (a === '--no-verify') { out.verify = false; continue; }
    if (a === '--status') { out.status = String(argv[++i] || '').toUpperCase(); continue; }
    console.warn('[warn] Unknown arg:', a);
  }
  if (!out.clinic && !out.email && !out.slug) throw new Error('Provide --clinic <ID> or --email <EMAIL> or --slug <SLUG>');
  if (!out.recipient) throw new Error('--recipient is required');
  if (!/^re_[A-Za-z0-9]+$/.test(out.recipient)) throw new Error('--recipient must start with re_ (v5 id)');
  if (!out.status) out.status = 'ACTIVE';
  return out;
}

function buildAuthHeader() {
  const basic = process.env.PAGARME_BASIC_AUTH && String(process.env.PAGARME_BASIC_AUTH).trim();
  const apiKey = process.env.PAGARME_API_KEY && String(process.env.PAGARME_API_KEY).trim();
  if (basic) return `Basic ${basic}`;
  if (apiKey) return `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`;
  return null;
}

async function verifyRecipientAtProvider(recipientId) {
  const baseUrl = process.env.PAGARME_BASE_URL || 'https://api.pagar.me/core/v5';
  const auth = buildAuthHeader();
  if (!auth) throw new Error('Missing PAGARME_BASIC_AUTH or PAGARME_API_KEY for verification');
  const url = `${baseUrl.replace(/\/$/, '')}/recipients/${encodeURIComponent(recipientId)}`;
  const res = await fetch(url, { headers: { Authorization: auth, 'Content-Type': 'application/json' } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Provider verification failed: HTTP ${res.status} ${res.statusText} ${text}`);
  }
  const json = await res.json().catch(() => ({}));
  if (!json || !json.id) throw new Error('Provider returned no id for recipient');
  return json;
}

(async () => {
  const args = parseArgs(process.argv);
  const prisma = new PrismaClient();
  const startedAt = new Date();
  try {
    console.log('[merchant:recipient:set] starting', { startedAt: startedAt.toISOString(), clinic: args.clinic, recipient: args.recipient, verify: args.verify, dryRun: args.dryRun });

    // Resolve clinic
    let clinic = null;
    if (args.clinic) {
      clinic = await prisma.clinic.findUnique({ where: { id: String(args.clinic) }, select: { id: true, name: true, email: true } });
      if (!clinic) throw new Error(`Clinic not found: ${args.clinic}`);
    } else if (args.email) {
      const email = String(args.email).trim();
      const matches = await prisma.clinic.findMany({ where: { email }, select: { id: true, name: true, email: true } });
      if (!matches.length) throw new Error(`No clinic found with email: ${email}`);
      if (matches.length > 1) throw new Error(`Multiple clinics found with email: ${email}. Use --clinic <ID>.`);
      clinic = matches[0];
    } else if (args.slug) {
      const slug = String(args.slug).trim();
      clinic = await prisma.clinic.findUnique({ where: { slug }, select: { id: true, name: true, email: true, slug: true } });
      if (!clinic) throw new Error(`Clinic not found with slug: ${slug}`);
    }

    // Verify at provider if requested
    let provider = null;
    if (args.verify) {
      provider = await verifyRecipientAtProvider(args.recipient);
      console.log('[merchant:recipient:set] provider ok', { id: provider.id, name: provider.name || provider.code || undefined });
    } else {
      console.log('[merchant:recipient:set] skipping provider verification (--no-verify)');
    }

    // Ensure merchant row
    const before = await prisma.merchant.upsert({
      where: { clinicId: clinic.id },
      update: {},
      create: { clinicId: clinic.id, status: 'PENDING' },
      select: { clinicId: true, recipientId: true, status: true, splitPercent: true, platformFeeBps: true },
    });

    console.log('[merchant:recipient:set] current', before);
    const data = {
      recipientId: args.recipient,
      status: args.status,
      lastSyncAt: new Date(),
    };

    if (args.dryRun) {
      console.log('[merchant:recipient:set] DRY RUN — would update:', data);
    } else {
      const after = await prisma.merchant.update({ where: { clinicId: clinic.id }, data, select: { clinicId: true, recipientId: true, status: true, lastSyncAt: true } });
      console.log('[merchant:recipient:set] updated', after);
    }

    console.log('[merchant:recipient:set] done', { finishedAt: new Date().toISOString() });
  } catch (e) {
    console.error('[merchant:recipient:set] error', e);
    process.exitCode = 1;
  } finally {
    try { await prisma.$disconnect(); } catch {}
  }
})();
