#!/usr/bin/env node
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  // Create tables if not exist (Postgres) — one statement per call
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS oauth_states (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      state TEXT NOT NULL UNIQUE,
      nonce TEXT,
      code_verifier TEXT,
      tenant_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      used_at TIMESTAMPTZ
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS oauth_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id TEXT,
      provider TEXT NOT NULL DEFAULT 'mockbank',
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      scope TEXT,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS payment_consents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id TEXT,
      consent_id TEXT NOT NULL UNIQUE,
      status TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS openbanking_payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_payment_id TEXT,
      consent_id TEXT,
      amount_cents INTEGER,
      currency TEXT,
      status TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  console.log('Open Finance tables ensured.');
}

main().then(async () => {
  await prisma.$disconnect();
}).catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
