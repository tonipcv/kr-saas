#!/usr/bin/env node
/*
  Usage examples:
    node scripts/set-clinic-subdomain.js --slug=bella-vida --subdomain=bella-vitta
    node scripts/set-clinic-subdomain.js --clinicId=<id> --subdomain=<value>
    node scripts/set-clinic-subdomain.js --check --slug=bella-vida

  This script updates the clinics.subdomain column via RAW SQL (independent of Prisma schema typing)
  and then verifies the saved value by selecting it back from the DB.
*/

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { check: false };
  for (const a of args) {
    if (a === '--check') { out.check = true; continue; }
    const [k, v] = a.split('=');
    if (!k || typeof v === 'undefined') continue;
    const key = k.replace(/^--/, '');
    out[key] = v;
  }
  return out;
}

function validateSubdomain(value) {
  if (!value || !value.trim()) return { ok: false, error: 'Empty subdomain' };
  const v = value.trim().toLowerCase();
  if (!/^[a-z0-9-]{3,63}$/.test(v)) return { ok: false, error: 'Invalid: use [a-z0-9-], 3-63 chars' };
  if (v.startsWith('-') || v.endsWith('-')) return { ok: false, error: 'Cannot start/end with -' };
  const reserved = new Set(['www','api','assets','static']);
  if (reserved.has(v)) return { ok: false, error: 'Reserved subdomain' };
  return { ok: true, value: v };
}

async function resolveClinic({ clinicId, slug }) {
  if (clinicId) {
    const rows = await prisma.$queryRawUnsafe('SELECT id, name, slug, "subdomain" FROM clinics WHERE id = $1 LIMIT 1', clinicId);
    return rows && rows[0] ? rows[0] : null;
  }
  if (slug) {
    const rows = await prisma.$queryRawUnsafe('SELECT id, name, slug, "subdomain" FROM clinics WHERE slug = $1 LIMIT 1', slug);
    return rows && rows[0] ? rows[0] : null;
  }
  return null;
}

async function checkUniqueSubdomain(v, excludeId) {
  const rows = await prisma.$queryRawUnsafe('SELECT id FROM clinics WHERE "subdomain" = $1 AND id <> $2 LIMIT 1', v, excludeId || '');
  return !(rows && rows[0]);
}

async function setSubdomain(clinicId, v) {
  await prisma.$executeRawUnsafe('UPDATE clinics SET "subdomain" = $1, "updatedAt" = NOW() WHERE id = $2', v, clinicId);
}

async function main() {
  const { clinicId, slug, subdomain, check } = parseArgs();
  if (!clinicId && !slug) {
    console.error('Provide --clinicId or --slug');
    process.exit(1);
  }

  const clinic = await resolveClinic({ clinicId, slug });
  if (!clinic) {
    console.error('Clinic not found');
    process.exit(1);
  }

  if (check) {
    console.log(JSON.stringify({ mode: 'check', clinic }, null, 2));
    process.exit(0);
  }

  if (!subdomain) {
    console.error('Provide --subdomain to set');
    process.exit(1);
  }

  const val = validateSubdomain(subdomain);
  if (!val.ok) {
    console.error('Validation error:', val.error);
    process.exit(1);
  }

  const unique = await checkUniqueSubdomain(val.value, clinic.id);
  if (!unique) {
    console.error('Subdomain already in use');
    process.exit(1);
  }

  await setSubdomain(clinic.id, val.value);
  const after = await resolveClinic({ clinicId: clinic.id });
  console.log(JSON.stringify({ before: clinic, after }, null, 2));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { try { await prisma.$disconnect(); } catch {} });
