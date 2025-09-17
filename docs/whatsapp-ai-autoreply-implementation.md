# WhatsApp AI Auto-reply – MVP Implementation

This document summarizes the MVP auto-reply implementation added to the WhatsApp integration, the events instrumented, and how to operate and extend it safely.

## Overview

- Auto-reply (assistant) is executed in the WhatsApp webhook when enabled via environment flag.
- Basic intent classification is rule-based, with short and safe replies.
- Conversation session start is detected (24h window) to emit `conversation_started` only when appropriate.
- Events are recorded to build a defensible dataset: `campaign_sent`, `campaign_replied`, `conversation_started`, and `ai_autoreply_sent`.

## Files Touched

- `src/lib/ai/auto-reply.ts`
  - Exposes `classifyIntent(text)`, `generateReply(classified)`, `shouldAutoReply(classified)`.
  - Intents covered: greeting, schedule, pricing, hours, human, unknown.

- `src/app/api/integrations/whatsapp/webhook/route.ts`
  - Parses inbound webhook payloads and routes messages.
  - Resolves `clinicId` and decrypts WhatsApp access token from `clinic_integrations`.
  - Session detection: emits `conversation_started` only if no event for `from` in last 24h.
  - Emits `campaign_replied` with `{ campaign_id?, message_text, from }`.
  - If `WHATSAPP_AI_AUTOREPLY_ENABLED=true`, classifies, replies via `sendWhatsAppText()`, and emits `ai_autoreply_sent`.

- `src/app/api/v2/doctor/campaigns/[id]/send/route.ts`
  - Accepts optional `trigger: string` in body and forwards it in `campaign_sent` metadata.

- `src/lib/event-schemas.ts`
  - Added metadata schema for `ai_autoreply_sent`: `{ intent, confidence, message_id? }`.
  - Registered conditionally to avoid build breaks until Prisma schema is updated.

- `scripts/migrations/20250916_add_ai_autoreply_event.js`
  - Adds enum value `ai_autoreply_sent` to `event_type_enum` in Postgres if missing.

## How it Works (Webhook Flow)

1. Receive webhook → extract `phone_number_id`, `messages[]` and sender `from`.
2. Resolve `clinicId` and decrypt access token via `clinic_integrations`.
3. Session detection (24h):
   - Query `events` for `conversation_started` with same `clinic_id` and `metadata->>'from'` in last 24h.
   - If none, emit `conversation_started` with `{ channel:'whatsapp', from }`.
4. Emit `campaign_replied` (MVP) with `{ campaign_id?: 'unknown' | value, message_text, from }`.
5. If `WHATSAPP_AI_AUTOREPLY_ENABLED=true` and confidence ≥ 0.5:
   - Build a short reply and send with `sendWhatsAppText()`.
   - Emit `ai_autoreply_sent` with `{ intent, confidence }`.

## Configuration

- `WHATSAPP_AI_AUTOREPLY_ENABLED=true` to enable the assistant.
- `WHATSAPP_VERIFY_TOKEN` for webhook verification.
- `WHATSAPP_GRAPH_BASE`, `WHATSAPP_GRAPH_VERSION` (defaults provided).

## Testing

- Simulate webhook POST to `/api/integrations/whatsapp/webhook` with a Meta payload.
- Verify events in `/doctor/events` or `GET /api/events/metrics?clinicId=...`.
- Toggle `WHATSAPP_AI_AUTOREPLY_ENABLED` to validate reply behavior.

## Roadmap / Next Steps

- Correlation for `campaign_id`:
  - Add a `campaign_threads` table to store `(clinic_id, campaign_id, phone_number_id, recipient, thread_hint, created_at)` at send time, and consult it in webhook.
- Enforce 24h session using last inbound/outbound activity, not only `conversation_started`.
- Add `message_id` to `ai_autoreply_sent` (populate from Graph response).
- UI toggles for doctors (enable/disable, confidence threshold, business hours).
- Optional LLM fallback with strict safety rules when regex classifier fails.
