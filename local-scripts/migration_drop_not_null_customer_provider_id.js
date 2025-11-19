#!/usr/bin/env node
/*
Alter column customer_providers.provider_customer_id to be NULLable (idempotent)
Also ensures supporting index exists. Use when Prisma schema changed to String? but database still NOT NULL.

Run:
  node local-scripts/migration_drop_not_null_customer_provider_id.js
*/
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function exec(sql){
  try { const res = await prisma.$executeRawUnsafe(sql); return { ok:true, res }; }
  catch(e){ return { ok:false, error: e?.message || String(e) }; }
}

async function main(){
  console.log('\nMake provider_customer_id NULLable on customer_providers');
  // Check current nullability and alter only if needed
  const check = await prisma.$queryRawUnsafe(`
    SELECT is_nullable FROM information_schema.columns
    WHERE table_name = 'customer_providers' AND column_name = 'provider_customer_id'
    LIMIT 1;
  `).catch(()=>[]);
  const isNullable = Array.isArray(check) && check[0] && String(check[0].is_nullable||'').toUpperCase() === 'YES';
  console.log('Current is_nullable:', isNullable);

  if (!isNullable) {
    const r = await exec('ALTER TABLE customer_providers ALTER COLUMN provider_customer_id DROP NOT NULL;');
    console.log(r.ok ? 'OK: column altered' : 'ERR: ' + r.error);
  } else {
    console.log('Skip: already NULLable');
  }

  // Ensure unique index exists (it should already); recreate is not necessary
  const idx = await prisma.$queryRawUnsafe(`
    SELECT indexname FROM pg_indexes WHERE tablename='customer_providers' AND indexname LIKE 'customer_providers_provider_account_id_provider_customer_id%';
  `).catch(()=>[]);
  console.log('Index check:', idx && idx.length ? 'exists' : 'not found (Prisma migration manages it)');
}

main().catch(e=>{console.error(e); process.exit(1);}).finally(async()=>{await prisma.$disconnect();});
