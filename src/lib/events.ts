import { prisma } from '@/lib/prisma';
import { Event, EventActor, EventType } from '@prisma/client';
import { z } from 'zod';
import { eventEnvelopeSchema, eventMetadataRegistry, EventEnvelope } from './event-schemas';

export type EmitEventInput = EventEnvelope;

export async function emitEvent(input: EmitEventInput): Promise<Event> {
  // Validate envelope (type-safe enums)
  const env = eventEnvelopeSchema.parse(input);

  // Pick schema for this event type and validate metadata (optional)
  const metaSchema = eventMetadataRegistry[env.eventType];
  const meta = metaSchema ? metaSchema.parse(env.metadata ?? {}) : (env.metadata ?? {});

  const timestamp = env.timestamp ? new Date(env.timestamp) : new Date();

  // Upsert by eventId when provided for idempotency
  if (env.eventId) {
    console.log('[events][emit] upsert', { eventId: env.eventId, eventType: env.eventType, clinicId: env.clinicId, customerId: env.customerId });
    const ev = await prisma.event.upsert({
      where: { eventId: env.eventId },
      create: {
        eventId: env.eventId,
        eventType: env.eventType as EventType,
        actor: env.actor as EventActor,
        clinicId: env.clinicId,
        customerId: env.customerId ?? null,
        timestamp,
        metadata: meta as any,
      },
      update: {},
    });
    console.log('[events][emit] upsert ok', { id: ev.id, eventId: ev.eventId, eventType: ev.eventType, clinicId: ev.clinicId });
    return ev;
  }

  // Simple create when no external id
  console.log('[events][emit] create', { eventType: env.eventType, clinicId: env.clinicId, customerId: env.customerId });
  const created = await prisma.event.create({
    data: {
      eventType: env.eventType as EventType,
      actor: env.actor as EventActor,
      clinicId: env.clinicId,
      customerId: env.customerId ?? null,
      timestamp,
      metadata: meta as any,
    },
  });
  console.log('[events][emit] create ok', { id: created.id, eventType: created.eventType, clinicId: created.clinicId });
  return created;
}
