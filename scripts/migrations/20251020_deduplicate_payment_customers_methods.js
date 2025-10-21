#!/usr/bin/env node
/*
  Migration: Deduplicate rows before adding unique indexes on payment_customers and payment_methods
  Usage:
    node scripts/migrations/20251020_deduplicate_payment_customers_methods.js

  Strategy:
  - payment_customers: for each (doctor_id, patient_profile_id, provider), keep the most recent row (by created_at, fallback id) and delete others.
  - payment_methods: for each (payment_customer_id, provider_card_id), keep the most recent row and delete others.
*/
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('[dedupe] Starting deduplication for payment_customers/payment_methods...');

    // payment_customers duplicates
    const hasPC = await prisma.$queryRawUnsafe(
      `SELECT to_regclass('public.payment_customers') IS NOT NULL AS has`
    );
    if (Array.isArray(hasPC) && (hasPC[0]?.has === true || hasPC[0]?.has === 't')) {
      console.log('[dedupe] Processing payment_customers...');
      const pcDupRows = await prisma.$queryRawUnsafe(
        `SELECT doctor_id, patient_profile_id, provider, COUNT(*) AS cnt
           FROM public.payment_customers
          GROUP BY doctor_id, patient_profile_id, provider
         HAVING COUNT(*) > 1`
      );
      console.log(`[dedupe] payment_customers duplicate groups: ${pcDupRows.length}`);
      for (const g of pcDupRows) {
        const { doctor_id, patient_profile_id, provider } = g;
        // Select rows ordered by created_at desc, id desc (keep first)
        const rows = await prisma.$queryRawUnsafe(
          `SELECT id FROM public.payment_customers
            WHERE doctor_id = $1 AND patient_profile_id = $2 AND provider = $3
            ORDER BY created_at DESC NULLS LAST, id DESC`,
          String(doctor_id), String(patient_profile_id), String(provider)
        );
        const keepId = rows[0]?.id;
        const toDelete = rows.slice(1).map(r => r.id);
        if (toDelete.length > 0) {
          console.log(`[dedupe] payment_customers (${doctor_id}, ${patient_profile_id}, ${provider}) delete ${toDelete.length}`);
          await prisma.$executeRawUnsafe(
            `DELETE FROM public.payment_customers WHERE id = ANY($1::text[])`,
            toDelete
          );
        }
      }
    } else {
      console.log('[dedupe] payment_customers table not found, skipping.');
    }

    // payment_methods duplicates
    const hasPM = await prisma.$queryRawUnsafe(
      `SELECT to_regclass('public.payment_methods') IS NOT NULL AS has`
    );
    if (Array.isArray(hasPM) && (hasPM[0]?.has === true || hasPM[0]?.has === 't')) {
      console.log('[dedupe] Processing payment_methods...');
      const pmDupRows = await prisma.$queryRawUnsafe(
        `SELECT payment_customer_id, provider_card_id, COUNT(*) AS cnt
           FROM public.payment_methods
          GROUP BY payment_customer_id, provider_card_id
         HAVING COUNT(*) > 1`
      );
      console.log(`[dedupe] payment_methods duplicate groups: ${pmDupRows.length}`);
      for (const g of pmDupRows) {
        const { payment_customer_id, provider_card_id } = g;
        const rows = await prisma.$queryRawUnsafe(
          `SELECT id FROM public.payment_methods
            WHERE payment_customer_id = $1 AND provider_card_id = $2
            ORDER BY created_at DESC NULLS LAST, id DESC`,
          String(payment_customer_id), String(provider_card_id)
        );
        const keepId = rows[0]?.id;
        const toDelete = rows.slice(1).map(r => r.id);
        if (toDelete.length > 0) {
          console.log(`[dedupe] payment_methods (${payment_customer_id}, ${provider_card_id}) delete ${toDelete.length}`);
          await prisma.$executeRawUnsafe(
            `DELETE FROM public.payment_methods WHERE id = ANY($1::text[])`,
            toDelete
          );
        }
      }
    } else {
      console.log('[dedupe] payment_methods table not found, skipping.');
    }

    console.log('[dedupe] Completed successfully.');
  } catch (e) {
    console.error('[dedupe] Error:', e?.message || e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
