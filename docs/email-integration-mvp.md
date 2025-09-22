# Email Integration MVP (SendPulse) — Safe Plan

Goal: Add Email channel without impacting current WhatsApp/SMS broadcast flow. Ship in small, reversible steps.

## Principles
- Preserve existing functionality (WhatsApp/SMS) untouched.
- Add new endpoints and UI behind a separate path first (Integrations > Email).
- Only wire Broadcast to Email after setup is stable.

## Milestones

1) Docs & Stubs (this PR)
- Create this plan (docs/email-integration-mvp.md).
- Add stub endpoints:
  - POST /api/integrations/email/sendpulse/connect → 501 Not Implemented
  - POST /api/webhooks/sendpulse → 200 OK, store nothing (placeholder)
- No changes to Broadcast page.

2) Backend Connect (separate PR)
- Prisma: add EmailIntegration, EmailDomain, EmailSender, EmailEvent.
- Implement connect route using src/lib/crypto.ts to encrypt secrets.
- Domain & sender endpoints (create/list/verify) — minimal happy path.

3) Integrations UI (separate PR)
- Page: /doctor/integrations/email
- Step-by-step: Connect → Domain (SPF/DKIM) → Verify → Sender → Default sender.

4) Broadcast Email Tab (separate PR)
- Add Email tab (Subject, HTML, Sender selector, Test send).
- Only enable if clinic has verified domain + default sender.

5) Webhooks + Events + Suppressions (separate PR)
- Handle delivered/opened/clicked/bounced/unsubscribed into EmailEvent.
- Unsubscribe link + suppression check before enqueue.

6) Queue & Rate limits (separate PR)
- BullMQ/Redis or PG job table; per-clinic rate limiting; retries.

## Notes
- Provider: SendPulse API (not SMTP) for domain/sender management & tracking.
- Never log secrets. Keep keys encrypted at rest.
- Use feature flags/guards to keep Email channel off until ready.
