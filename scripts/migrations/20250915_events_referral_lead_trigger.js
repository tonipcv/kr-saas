#!/usr/bin/env node
/*
  Creates an idempotent trigger to emit lead_converted into events when referral_leads are updated to CONVERTED
  This avoids changing application routes and captures conversions from any path.
*/

const { prisma } = require('../../dist/lib/prisma.js');

const STATEMENTS = [
  // Function: events_on_referral_lead_update()
  `CREATE OR REPLACE FUNCTION events_on_referral_lead_update() RETURNS TRIGGER AS $$
   DECLARE
     v_clinic_id TEXT;
     v_days NUMERIC;
   BEGIN
     -- Only act when status becomes CONVERTED or converted_user_id is set
     IF (NEW.status = 'CONVERTED' AND (OLD.status IS DISTINCT FROM 'CONVERTED'))
        OR (NEW."convertedUserId" IS NOT NULL AND OLD."convertedUserId" IS DISTINCT FROM NEW."convertedUserId") THEN

       -- Resolve clinic_id: prefer explicit lead.clinic_id, else by doctor ownership, else first doctor membership
       v_clinic_id := NEW."clinic_id";
       IF v_clinic_id IS NULL THEN
         SELECT c.id INTO v_clinic_id
         FROM clinics c
         WHERE c.ownerId = NEW."doctorId"
         LIMIT 1;
       END IF;
       IF v_clinic_id IS NULL THEN
         SELECT cm."clinicId" INTO v_clinic_id
         FROM "clinic_members" cm
         WHERE cm."userId" = NEW."doctorId" AND cm."isActive" = true
         LIMIT 1;
       END IF;

       -- Compute time_to_convert_days when possible
       BEGIN
         v_days := EXTRACT(EPOCH FROM (COALESCE(NEW."convertedAt", now()) - NEW."createdAt")) / 86400.0;
       EXCEPTION WHEN others THEN
         v_days := NULL;
       END;

       -- Insert into events table (ignore failures)
       BEGIN
         INSERT INTO events(id, event_id, event_type, customer_id, clinic_id, actor, timestamp, metadata, created_at)
         VALUES (
           (gen_random_uuid())::text,
           NULL,
           'lead_converted'::event_type_enum,
           NEW."convertedUserId",
           COALESCE(v_clinic_id, 'unknown'),
           'system'::event_actor_enum,
           now(),
           jsonb_build_object(
             'conversion_channel', NULL,
             'time_to_convert_days', v_days
           ),
           now()
         );
       EXCEPTION WHEN others THEN
         -- swallow to avoid breaking updates
         NULL;
       END;
     END IF;
     RETURN NEW;
   END;
   $$ LANGUAGE plpgsql;`,

  // Create trigger if not exists
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_trigger WHERE tgname = 'trg_events_referral_lead_update'
     ) THEN
       CREATE TRIGGER trg_events_referral_lead_update
       AFTER UPDATE ON referral_leads
       FOR EACH ROW
       EXECUTE FUNCTION events_on_referral_lead_update();
     END IF;
   END $$;`,
];

async function main() {
  console.log('[migration] Starting: referral_leads lead_converted trigger');
  for (const sql of STATEMENTS) {
    await prisma.$executeRawUnsafe(sql);
  }
  console.log('[migration] Done.');
}

main()
  .catch((e) => { console.error('[migration] Error:', e); process.exit(1); })
  .finally(async () => { try { await prisma.$disconnect(); } catch {} });
