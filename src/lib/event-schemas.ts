import { z } from 'zod';
import { EventType, EventActor } from '@prisma/client';

// Envelope (API level)
export const eventEnvelopeSchema = z.object({
  eventId: z.string().optional(),
  eventType: z.nativeEnum(EventType),
  actor: z.nativeEnum(EventActor),
  clinicId: z.string().min(1),
  customerId: z.string().optional().nullable(),
  timestamp: z.coerce.date().optional(),
  metadata: z.unknown().optional(),
});

// Per-type metadata schemas
const customer_created = z.object({
  nome: z.string(),
  idade: z.number().int().nonnegative().optional(),
  gênero: z.string().optional(),
  canal_origem: z.string().optional(),
  consentimento_marketing: z.boolean().optional(),
});

const customer_updated = z.object({
  changes: z.record(z.any()).optional(),
});

const customer_visit = z.object({
  visit_type: z.enum(['walk-in', 'appointment']),
  duration: z.number().int().nonnegative().optional(),
});

const lead_created = z.object({
  // Source & device
  source: z.enum(['instagram', 'google', 'referral']).optional(),
  device: z.string().optional(),
  campaign_id: z.string().optional(),
  // Lead info
  name: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  // Referral context
  referrer_code: z.string().optional(),
  referrer_id: z.string().optional(),
  referrer_name: z.string().optional(),
  referrer_email: z.string().optional(),
  referral_code: z.string().optional(),
  // Doctor/clinic context
  doctor_id: z.string().optional(),
  doctor_slug: z.string().optional(),
  clinic_slug: z.string().optional(),
  // Product/campaign context
  product_id: z.union([z.string(), z.number()]).optional(),
  product_name: z.string().optional(),
  product_category: z.string().optional(),
  price: z.number().optional(),
  coupon: z.string().optional(),
  discount_percent: z.number().optional(),
});

const lead_converted = z.object({
  conversion_channel: z.string().optional(),
  time_to_convert_days: z.number().nonnegative().optional(),
});

const review_submitted = z.object({
  nps_score: z.number().int().min(0).max(10).optional(),
  text: z.string().optional(),
  sentiment_score: z.number().min(-1).max(1).optional(),
});

const feedback_negative = z.object({
  reason: z.enum(['price', 'service', 'delay']).optional(),
});

const purchase_made = z.object({
  value: z.number(),
  currency: z.string(),
  items: z
    .array(z.object({ categoria: z.string(), qty: z.number().int().positive(), price: z.number().nonnegative() }))
    .default([]),
  channel: z.enum(['pos', 'online', 'whatsapp']).optional(),
});

const purchase_refund = z.object({ value: z.number(), reason: z.string().optional() });

const payment_processed = z.object({ method: z.enum(['card', 'pix', 'cash']), status: z.enum(['success', 'failed']) });

const subscription_billed = z.object({ plan_id: z.string(), amount: z.number(), status: z.string() });
const subscription_canceled = z.object({ reason: z.enum(['no_value', 'too_expensive', 'moved']).optional() });
const chargeback_reported = z.object({ amount: z.number(), processor: z.string().optional() });

const reward_created = z.object({ reward_id: z.string(), type: z.enum(['cashback', 'points', 'discount']), rules: z.any(), expiry: z.string().optional() });
const reward_offered = z.object({ channel: z.enum(['whatsapp', 'email', 'sms']), trigger: z.enum(['ai', 'manual']) });
const reward_viewed = z.object({ channel: z.enum(['whatsapp', 'email', 'sms']), time_to_view_seconds: z.number().nonnegative().optional() });
const reward_claimed = z.object({ reward_id: z.string() });
const reward_redeemed = z.object({ purchase_id: z.string().optional(), value_applied: z.number().optional() });
const reward_expired = z.object({ reward_id: z.string() });
const points_earned = z.object({ value: z.number().nonnegative(), source: z.enum(['purchase', 'referral', 'review']) });
const points_spent = z.object({ value: z.number().nonnegative(), usage: z.enum(['discount', 'gift']) });

const campaign_sent = z.object({ campaign_id: z.string(), channel: z.string().optional(), audience_size: z.number().int().nonnegative().optional() });
const campaign_opened = z.object({ campaign_id: z.string(), device: z.string().optional() });
const campaign_clicked = z.object({ campaign_id: z.string(), link_id: z.string().optional() });
const campaign_replied = z.object({ campaign_id: z.string(), message_text: z.string().optional(), sentiment_score: z.number().min(-1).max(1).optional() });

const conversation_started = z.object({ channel: z.enum(['whatsapp', 'chatbot']) });
const conversation_closed = z.object({ outcome: z.enum(['booked', 'ignored', 'opted_out']) });

const membership_started = z.object({ plan_id: z.string(), tier: z.enum(['basic', 'premium']), price: z.number().optional(), duration: z.number().optional() });
const membership_renewed = z.object({ plan_id: z.string(), payment_status: z.string().optional() });
const membership_canceled = z.object({ reason: z.string().optional() });
const membership_upgraded = z.object({ from_plan: z.string(), to_plan: z.string() });

const prediction_made = z.object({ model: z.enum(['churn', 'ltv', 'next_best_offer']), score: z.number(), features_used: z.any().optional() });
const action_taken = z.object({ accepted: z.boolean(), by: z.enum(['clinic', 'system']) });
const outcome_recorded = z.object({ success: z.boolean(), lag_days: z.number().optional() });
const ai_autoreply_sent = z.object({ intent: z.string(), confidence: z.number().min(0).max(1), message_id: z.string().optional() });

const user_logged_in = z.object({
  user_id: z.string(),
  role: z.enum(['admin', 'staff', 'doctor', 'patient', 'super_admin']).optional(),
});
const config_changed = z.object({ field_changed: z.string(), old_value: z.any().optional(), new_value: z.any().optional() });
const integration_added = z.object({ provider: z.enum(['stripe', 'pagarme', 'zapier', 'whatsapp']).optional() });

// Registry mapping
const baseRegistry: Record<EventType, z.ZodTypeAny> = {
  // Cliente
  [EventType.customer_created]: customer_created,
  [EventType.customer_updated]: customer_updated,
  [EventType.customer_visit]: customer_visit,
  [EventType.lead_created]: lead_created,
  [EventType.lead_converted]: lead_converted,
  [EventType.review_submitted]: review_submitted,
  [EventType.feedback_negative]: feedback_negative,
  // Transação
  [EventType.purchase_made]: purchase_made,
  [EventType.purchase_refund]: purchase_refund,
  [EventType.payment_processed]: payment_processed,
  [EventType.subscription_billed]: subscription_billed,
  [EventType.subscription_canceled]: subscription_canceled,
  [EventType.chargeback_reported]: chargeback_reported,
  // Loyalty
  [EventType.reward_created]: reward_created,
  [EventType.reward_offered]: reward_offered,
  [EventType.reward_viewed]: reward_viewed,
  [EventType.reward_claimed]: reward_claimed,
  [EventType.reward_redeemed]: reward_redeemed,
  [EventType.reward_expired]: reward_expired,
  [EventType.points_earned]: points_earned,
  [EventType.points_spent]: points_spent,
  // Comunicação
  [EventType.campaign_sent]: campaign_sent,
  [EventType.campaign_opened]: campaign_opened,
  [EventType.campaign_clicked]: campaign_clicked,
  [EventType.campaign_replied]: campaign_replied,
  [EventType.conversation_started]: conversation_started,
  [EventType.conversation_closed]: conversation_closed,
  // Membership
  [EventType.membership_started]: membership_started,
  [EventType.membership_renewed]: membership_renewed,
  [EventType.membership_canceled]: membership_canceled,
  [EventType.membership_upgraded]: membership_upgraded,
  // IA
  [EventType.prediction_made]: prediction_made,
  [EventType.action_taken]: action_taken,
  [EventType.outcome_recorded]: outcome_recorded,
  // Sistema
  [EventType.user_logged_in]: user_logged_in,
  [EventType.config_changed]: config_changed,
  [EventType.integration_added]: integration_added,
};

// Conditionally augment with ai_autoreply_sent if present in generated enum (Prisma schema may not yet include it)
const maybeAi: any = {};
if ((EventType as any).ai_autoreply_sent) {
  maybeAi[(EventType as any).ai_autoreply_sent] = ai_autoreply_sent;
}

export const eventMetadataRegistry = { ...(baseRegistry as any), ...maybeAi } as Record<EventType, z.ZodTypeAny>;

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;
